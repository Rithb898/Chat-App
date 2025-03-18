// Expanded server.js with feature enhancements
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
dotenv.config();

// MongoDB connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chatapp');
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

// Call the connect function
connectDB();

// Enhanced message schema with support for reactions, read receipts, and more
const messageSchema = new mongoose.Schema({
    roomId: { type: String, required: true, index: true },
    type: { 
        type: String, 
        required: true,
        enum: ['system', 'user', 'file', 'private'] // Added file and private types
    },
    sender: String,
    recipient: String, // For private messages
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    fileUrl: String,
    fileName: String,
    fileType: String,
    fileSize: Number,
    isEdited: { type: Boolean, default: false },
    editHistory: [{
        text: String,
        editedAt: { type: Date, default: Date.now }
    }],
    reactions: [{
        emoji: String,
        user: String,
        addedAt: { type: Date, default: Date.now }
    }],
    readBy: [{ 
        user: String, 
        readAt: { type: Date, default: Date.now }
    }]
});

const roomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: Date.now },
    isPrivate: { type: Boolean, default: false }
});

const Message = mongoose.model('Message', messageSchema);
const Room = mongoose.model('Room', roomSchema);

// Express app setup
const app = express();
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
}));
app.use(express.json());

// File upload configuration
const storageDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, storageDir);
    },
    filename: (req, file, cb) => {
        const uniqueFilename = `${Date.now()}-${uuidv4()}-${file.originalname}`;
        cb(null, uniqueFilename);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        // Allow only certain file types
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images, PDFs, DOC, DOCX and TXT are allowed.'));
        }
    }
});

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

// In-memory storage for active users
const activeRooms = {};
const activeUsers = {};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    let currentRoom = null;
    let currentUsername = null;

    // Add user to active users
    socket.on('login', (username) => {
        currentUsername = username;
        activeUsers[socket.id] = {
            username,
            socketId: socket.id
        };
        
        // Notify all clients about online users
        io.emit('userStatus', Object.values(activeUsers).map(user => ({
            username: user.username,
            online: true
        })));
    });

    // Handle user joining a room
    socket.on('join', async ({ username, roomId }) => {
        try {
            // Leave previous room if any
            if (currentRoom) {
                socket.leave(currentRoom);
                if (activeRooms[currentRoom] && activeRooms[currentRoom].users) {
                    delete activeRooms[currentRoom].users[socket.id];

                    // Notify room that user left
                    io.to(currentRoom).emit('message', {
                        type: 'system',
                        text: `${currentUsername} has left the room`,
                        timestamp: new Date().toISOString()
                    });

                    // Update user list
                    io.to(currentRoom).emit('userList', Object.values(activeRooms[currentRoom].users));
                }
            }

            // Join new room
            currentRoom = roomId;
            currentUsername = username;
            socket.join(roomId);

            // Initialize room in memory if it doesn't exist
            if (!activeRooms[roomId]) {
                activeRooms[roomId] = {
                    users: {}
                };
            }

            // Add user to room
            activeRooms[roomId].users[socket.id] = username;

            // Create or update room in database
            await Room.findOneAndUpdate(
                { roomId },
                { roomId, name: roomId, lastActivity: new Date() },
                { upsert: true, new: true }
            );

            // Create system message for joining
            const joinMessage = new Message({
                roomId,
                type: 'system',
                text: `${username} has joined the room`,
                timestamp: new Date()
            });
            await joinMessage.save();

            // Send join message to everyone
            io.to(roomId).emit('message', {
                type: 'system',
                text: `${username} has joined the room`,
                timestamp: new Date().toISOString()
            });

            // Send room history to new user
            const roomHistory = await Message.find({ 
                $or: [
                    { roomId }, 
                    { 
                        type: 'private', 
                        $or: [
                            { sender: username, recipient: { $in: Object.values(activeRooms[roomId].users) } },
                            { recipient: username, sender: { $in: Object.values(activeRooms[roomId].users) } }
                        ]
                    }
                ]
            })
            .sort({ timestamp: -1 })
            .limit(100)
            .sort({ timestamp: 1 });

            socket.emit('roomHistory', roomHistory);

            // Update user list for everyone in the room
            io.to(currentRoom).emit('userList', Object.values(activeRooms[currentRoom].users));
        } catch (error) {
            console.error('Error in join handler:', error);
            socket.emit('error', { message: 'Error joining room' });
        }
    });

    // Handle regular messages
    socket.on('sendMessage', async (message) => {
        try {
            if (!currentRoom || !activeRooms[currentRoom]) return;

            const messageObj = {
                roomId: currentRoom,
                type: 'user',
                sender: currentUsername,
                text: message,
                timestamp: new Date()
            };

            // Store message in database
            const newMessage = new Message(messageObj);
            await newMessage.save();

            // Update room's last activity
            await Room.findOneAndUpdate(
                { roomId: currentRoom },
                { lastActivity: new Date() }
            );

            // Send message to everyone in the room
            io.to(currentRoom).emit('message', {
                ...messageObj,
                _id: newMessage._id,
                timestamp: messageObj.timestamp.toISOString()
            });
        } catch (error) {
            console.error('Error in sendMessage handler:', error);
            socket.emit('error', { message: 'Error sending message' });
        }
    });

    // Handle private messages
    socket.on('sendPrivateMessage', async ({ recipient, message }) => {
        try {
            // Find recipient socket ID
            const recipientSocketId = Object.keys(activeUsers).find(
                key => activeUsers[key].username === recipient
            );

            const messageObj = {
                type: 'private',
                sender: currentUsername,
                recipient: recipient,
                text: message,
                timestamp: new Date()
            };

            // Store private message in database
            const newMessage = new Message(messageObj);
            await newMessage.save();

            // Send to recipient if online
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('privateMessage', {
                    ...messageObj,
                    _id: newMessage._id,
                    timestamp: messageObj.timestamp.toISOString()
                });
            }

            // Send back to sender
            socket.emit('privateMessage', {
                ...messageObj,
                _id: newMessage._id,
                timestamp: messageObj.timestamp.toISOString()
            });
        } catch (error) {
            console.error('Error in sendPrivateMessage handler:', error);
            socket.emit('error', { message: 'Error sending private message' });
        }
    });

    // Handle message reactions
    socket.on('addReaction', async ({ messageId, emoji }) => {
        try {
            // Add reaction to message
            const message = await Message.findById(messageId);
            if (!message) {
                return socket.emit('error', { message: 'Message not found' });
            }

            // Check if user already reacted with this emoji
            const existingReaction = message.reactions.find(
                r => r.user === currentUsername && r.emoji === emoji
            );

            if (existingReaction) {
                // Remove reaction if it exists
                message.reactions = message.reactions.filter(
                    r => !(r.user === currentUsername && r.emoji === emoji)
                );
            } else {
                // Add new reaction
                message.reactions.push({
                    emoji,
                    user: currentUsername,
                    addedAt: new Date()
                });
            }

            await message.save();

            // Broadcast reaction update
            if (message.type === 'private') {
                // For private messages, only notify the sender and recipient
                const recipientSocketId = Object.keys(activeUsers).find(
                    key => activeUsers[key].username === message.recipient
                );
                const senderSocketId = Object.keys(activeUsers).find(
                    key => activeUsers[key].username === message.sender
                );

                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('messageReaction', {
                        messageId,
                        reactions: message.reactions
                    });
                }

                if (senderSocketId) {
                    io.to(senderSocketId).emit('messageReaction', {
                        messageId,
                        reactions: message.reactions
                    });
                }
            } else {
                // For room messages, notify everyone in the room
                io.to(currentRoom).emit('messageReaction', {
                    messageId,
                    reactions: message.reactions
                });
            }
        } catch (error) {
            console.error('Error in addReaction handler:', error);
            socket.emit('error', { message: 'Error adding reaction' });
        }
    });

    // Handle message editing
    socket.on('editMessage', async ({ messageId, newText }) => {
        try {
            const message = await Message.findById(messageId);
            if (!message) {
                return socket.emit('error', { message: 'Message not found' });
            }

            // Only allow editing own messages
            if (message.sender !== currentUsername) {
                return socket.emit('error', { message: 'You can only edit your own messages' });
            }

            // Save old text to history
            message.editHistory.push({
                text: message.text,
                editedAt: new Date()
            });

            // Update message
            message.text = newText;
            message.isEdited = true;
            await message.save();

            // Broadcast the edit
            if (message.type === 'private') {
                // For private messages
                const recipientSocketId = Object.keys(activeUsers).find(
                    key => activeUsers[key].username === message.recipient
                );
                
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('messageEdited', {
                        messageId,
                        text: newText,
                        isEdited: true
                    });
                }
                
                // Also notify the sender
                socket.emit('messageEdited', {
                    messageId,
                    text: newText,
                    isEdited: true
                });
            } else {
                // For room messages
                io.to(currentRoom).emit('messageEdited', {
                    messageId,
                    text: newText,
                    isEdited: true
                });
            }
        } catch (error) {
            console.error('Error in editMessage handler:', error);
            socket.emit('error', { message: 'Error editing message' });
        }
    });

    // Handle message deletion
    socket.on('deleteMessage', async ({ messageId }) => {
        try {
            const message = await Message.findById(messageId);
            if (!message) {
                return socket.emit('error', { message: 'Message not found' });
            }

            // Only allow deleting own messages
            if (message.sender !== currentUsername) {
                return socket.emit('error', { message: 'You can only delete your own messages' });
            }

            // Option 1: Completely delete the message
            // await Message.findByIdAndDelete(messageId);
            
            // Option 2: Mark as deleted but keep the record
            message.text = "This message has been deleted";
            message.isDeleted = true;
            await message.save();

            // Broadcast the deletion
            if (message.type === 'private') {
                // For private messages
                const recipientSocketId = Object.keys(activeUsers).find(
                    key => activeUsers[key].username === message.recipient
                );
                
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('messageDeleted', { messageId });
                }
                
                // Also notify the sender
                socket.emit('messageDeleted', { messageId });
            } else {
                // For room messages
                io.to(currentRoom).emit('messageDeleted', { messageId });
            }
        } catch (error) {
            console.error('Error in deleteMessage handler:', error);
            socket.emit('error', { message: 'Error deleting message' });
        }
    });

    // Handle message read receipts
    socket.on('markAsRead', async ({ messageIds }) => {
        try {
            if (!Array.isArray(messageIds) || messageIds.length === 0) return;

            // Update each message with read receipt
            await Message.updateMany(
                { 
                    _id: { $in: messageIds },
                    'readBy.user': { $ne: currentUsername } // Don't add duplicate read receipts
                },
                { 
                    $push: { 
                        readBy: { 
                            user: currentUsername, 
                            readAt: new Date() 
                        } 
                    } 
                }
            );

            // Get updated messages to broadcast read status
            const updatedMessages = await Message.find({ _id: { $in: messageIds } });
            
            // Notify relevant users of read status updates
            updatedMessages.forEach(message => {
                if (message.type === 'private') {
                    // For private messages, notify the sender
                    const senderSocketId = Object.keys(activeUsers).find(
                        key => activeUsers[key].username === message.sender
                    );
                    
                    if (senderSocketId) {
                        io.to(senderSocketId).emit('messageRead', {
                            messageId: message._id,
                            readBy: message.readBy
                        });
                    }
                } else {
                    // For room messages, notify everyone in the room
                    io.to(currentRoom).emit('messageRead', {
                        messageId: message._id,
                        readBy: message.readBy
                    });
                }
            });
        } catch (error) {
            console.error('Error in markAsRead handler:', error);
        }
    });

    // Handle typing indicator
    socket.on('typing', (isTyping) => {
        if (!currentRoom) return;

        socket.to(currentRoom).emit('userTyping', {
            user: currentUsername,
            isTyping
        });
    });

    // Handle room info request
    socket.on('getRoomInfo', async (roomId) => {
        try {
            const room = await Room.findOne({ roomId });
            if (room) {
                socket.emit('roomExists', true);
            } else {
                socket.emit('roomExists', false);
            }
        } catch (error) {
            console.error('Error in getRoomInfo handler:', error);
            socket.emit('error', { message: 'Error getting room info' });
        }
    });

    // Handle user disconnect
    socket.on('disconnect', async () => {
        try {
            // Remove from active users
            if (currentUsername) {
                delete activeUsers[socket.id];
                
                // Notify all clients about user going offline
                io.emit('userStatus', [{
                    username: currentUsername,
                    online: false
                }]);
            }
            
            if (currentRoom && activeRooms[currentRoom] && activeRooms[currentRoom].users) {
                // Create and save disconnect message
                const leaveMessage = new Message({
                    roomId: currentRoom,
                    type: 'system',
                    text: `${currentUsername} has left the room`,
                    timestamp: new Date()
                });
                await leaveMessage.save();
                
                // Notify room that user left
                io.to(currentRoom).emit('message', {
                    type: 'system',
                    text: `${currentUsername} has left the room`,
                    timestamp: new Date().toISOString()
                });
                
                // Remove user from room
                delete activeRooms[currentRoom].users[socket.id];
                
                // Update user list
                io.to(currentRoom).emit('userList', Object.values(activeRooms[currentRoom].users));
                
                // Remove room from memory if empty
                if (Object.keys(activeRooms[currentRoom].users).length === 0) {
                    delete activeRooms[currentRoom];
                    console.log(`Room ${currentRoom} removed from active rooms (empty)`);
                }
            }
            
            console.log(`User disconnected: ${socket.id}`);
        } catch (error) {
            console.error('Error in disconnect handler:', error);
        }
    });
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { roomId, username } = req.body;
        if (!roomId || !username) {
            return res.status(400).json({ message: 'Room ID and username are required' });
        }

        // Create file message
        const fileMessage = new Message({
            roomId,
            type: 'file',
            sender: username,
            text: `Shared a file: ${req.file.originalname}`,
            timestamp: new Date(),
            fileUrl: `/uploads/${req.file.filename}`,
            fileName: req.file.originalname,
            fileType: req.file.mimetype,
            fileSize: req.file.size
        });

        await fileMessage.save();

        // Update room's last activity
        await Room.findOneAndUpdate(
            { roomId },
            { lastActivity: new Date() }
        );

        // Notify room about new file
        io.to(roomId).emit('message', {
            ...fileMessage.toObject(),
            _id: fileMessage._id,
            timestamp: fileMessage.timestamp.toISOString()
        });

        res.status(200).json({ 
            message: 'File uploaded successfully',
            fileUrl: `/uploads/${req.file.filename}`,
            messageId: fileMessage._id
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ message: 'Error uploading file' });
    }
});

// API endpoints for room management
app.get('/api/rooms', async (req, res) => {
    try {
        const rooms = await Room.find().sort({ lastActivity: -1 });
        res.json(rooms);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cleanup inactive rooms (can be run periodically with a cron job)
app.delete('/api/cleanup-rooms', async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const result = await Room.deleteMany({ lastActivity: { $lt: thirtyDaysAgo } });
        res.json({ message: `Deleted ${result.deletedCount} inactive rooms` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API to get message history with various filters
app.get('/api/messages', async (req, res) => {
    try {
        const { roomId, sender, before, after, limit = 50 } = req.query;
        
        if (!roomId) {
            return res.status(400).json({ message: 'Room ID is required' });
        }
        
        // Build query
        const query = { roomId };
        
        if (sender) {
            query.sender = sender;
        }
        
        if (before || after) {
            query.timestamp = {};
            if (before) query.timestamp.$lt = new Date(before);
            if (after) query.timestamp.$gt = new Date(after);
        }
        
        const messages = await Message.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .sort({ timestamp: 1 });
            
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});