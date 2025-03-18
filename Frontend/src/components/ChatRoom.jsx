import React, { useState, useEffect, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import io from "socket.io-client";

const socket = io("http://localhost:5000");

function ChatRoom() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const username = location.state?.username;

  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [roomExists, setRoomExists] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [privateMessage, setPrivateMessage] = useState("");
  const [privateRecipient, setPrivateRecipient] = useState("");
  const [showPrivateMessageForm, setShowPrivateMessageForm] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState("👍");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);

  // Common emojis for reactions
  const commonEmojis = ["👍", "❤️", "😂", "😮", "😢", "👏", "🎉"];

  // Redirect if no username is provided
  useEffect(() => {
    if (!username) {
      navigate("/");
      return;
    }

    // Login to the system
    socket.emit("login", username);

    // Check if room exists
    socket.emit("getRoomInfo", roomId);

    // Connect to room
    socket.emit("join", { username, roomId });

    // Cleanup on unmount
    return () => {
      socket.off("join");
      socket.off("getRoomInfo");
      socket.off("login");
    };
  }, [username, roomId, navigate]);

  useEffect(() => {
    // Socket event listeners
    socket.on("message", (message) => {
      setMessages((prevMessages) => [...prevMessages, message]);
      
      // Mark messages as read
      if (message.sender !== username && message._id) {
        socket.emit("markAsRead", { messageIds: [message._id] });
      }
    });

    socket.on("roomHistory", (history) => {
      setMessages(history);
      
      // Mark all messages as read
      const unreadMessageIds = history
        .filter(msg => msg.sender !== username && msg._id)
        .map(msg => msg._id);
        
      if (unreadMessageIds.length > 0) {
        socket.emit("markAsRead", { messageIds: unreadMessageIds });
      }
    });

    socket.on("userList", (userList) => {
      setUsers(userList);
    });

    socket.on("userTyping", ({ user, isTyping }) => {
      if (isTyping) {
        setTypingUsers((prev) => [...prev.filter((u) => u !== user), user]);
      } else {
        setTypingUsers((prev) => prev.filter((u) => u !== user));
      }
    });

    socket.on("roomExists", (exists) => {
      setRoomExists(exists);
    });

    socket.on("error", (errorData) => {
      setError(errorData.message);
      setTimeout(() => setError(null), 5000); // Clear error after 5 seconds
    });
    
    socket.on("privateMessage", (message) => {
      setMessages((prevMessages) => [...prevMessages, message]);
      
      // Mark private message as read if it's not from the current user
      if (message.sender !== username && message._id) {
        socket.emit("markAsRead", { messageIds: [message._id] });
      }
    });
    
    socket.on("messageReaction", ({ messageId, reactions }) => {
      setMessages((prevMessages) => 
        prevMessages.map(msg => 
          msg._id === messageId ? { ...msg, reactions } : msg
        )
      );
    });
    
    socket.on("messageEdited", ({ messageId, text, isEdited }) => {
      setMessages((prevMessages) => 
        prevMessages.map(msg => 
          msg._id === messageId ? { ...msg, text, isEdited } : msg
        )
      );
    });
    
    socket.on("messageDeleted", ({ messageId }) => {
      setMessages((prevMessages) => 
        prevMessages.map(msg => 
          msg._id === messageId ? { ...msg, text: "This message has been deleted", isDeleted: true } : msg
        )
      );
    });
    
    socket.on("messageRead", ({ messageId, readBy }) => {
      setMessages((prevMessages) => 
        prevMessages.map(msg => 
          msg._id === messageId ? { ...msg, readBy } : msg
        )
      );
    });
    
    socket.on("userStatus", (statusUpdates) => {
      // Handle user status updates if needed
      console.log("User status updates:", statusUpdates);
    });

    // Cleanup on unmount
    return () => {
      socket.off("message");
      socket.off("roomHistory");
      socket.off("userList");
      socket.off("userTyping");
      socket.off("roomExists");
      socket.off("error");
      socket.off("privateMessage");
      socket.off("messageReaction");
      socket.off("messageEdited");
      socket.off("messageDeleted");
      socket.off("messageRead");
      socket.off("userStatus");
    };
  }, [username]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle message submission
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (message.trim()) {
      socket.emit("sendMessage", message);
      setMessage("");
      socket.emit("typing", false);
    }
  };

  // Handle private message submission
  const handleSendPrivateMessage = (e) => {
    e.preventDefault();
    if (privateMessage.trim() && privateRecipient) {
      socket.emit("sendPrivateMessage", {
        recipient: privateRecipient,
        message: privateMessage
      });
      setPrivateMessage("");
      setShowPrivateMessageForm(false);
    }
  };

  // Handle file upload
  const handleFileUpload = async () => {
    if (!selectedFile) return;
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("roomId", roomId);
    formData.append("username", username);
    
    try {
      const response = await fetch("http://localhost:5000/api/upload", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error("Failed to upload file");
      }
      
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle file selection
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // Handle message editing
  const handleEditMessage = (msg) => {
    setEditingMessage(msg._id);
    setEditText(msg.text);
  };

  // Submit edited message
  const handleSubmitEdit = () => {
    if (editText.trim() && editingMessage) {
      socket.emit("editMessage", {
        messageId: editingMessage,
        newText: editText
      });
      setEditingMessage(null);
      setEditText("");
    }
  };

  // Handle message deletion
  const handleDeleteMessage = (messageId) => {
    if (window.confirm("Are you sure you want to delete this message?")) {
      socket.emit("deleteMessage", { messageId });
    }
  };

  // Handle reaction to message
  const handleAddReaction = (messageId, emoji) => {
    socket.emit("addReaction", { messageId, emoji });
    setShowEmojiPicker(false);
  };

  // Handle typing indicator
  const handleTyping = (e) => {
    setMessage(e.target.value);

    if (e.target.value) {
      socket.emit("typing", true);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("typing", false);
      }, 2000);
    } else {
      socket.emit("typing", false);
    }
  };

  // Copy room link to clipboard
  const copyRoomLink = () => {
    const roomLink = `${window.location.origin}/${roomId}`;
    navigator.clipboard.writeText(roomLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Handle opening private message form
  const handleOpenPrivateMessage = (recipient) => {
    setPrivateRecipient(recipient);
    setShowPrivateMessageForm(true);
  };

  // Handle room not found
  if (!roomExists && username) {
    return (
      <div className='room-not-found'>
        <h2>Room Not Found</h2>
        <p>The room you're trying to join doesn't exist.</p>
        <button onClick={() => navigate("/")}>Back to Home</button>
      </div>
    );
  }

  return (
    <div className='chat-room'>
      <div className='chat-header'>
        <h2>Chat Room: {roomId}</h2>
        <div className='room-actions'>
          <button className='copy-link-btn' onClick={copyRoomLink}>
            {copied ? "Link Copied!" : "Copy Room Link"}
          </button>
          <button className='leave-room-btn' onClick={() => navigate("/")}>
            Leave Room
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}

      <div className='chat-container'>
        <div className='sidebar'>
          <h3>Users Online ({users.length})</h3>
          <ul className='user-list'>
            {users.map((user, index) => (
              <li key={index} className={user === username ? "current-user" : ""}>
                {user} {user === username ? "(You)" : ""}
                {user !== username && (
                  <button 
                    className="private-msg-btn"
                    onClick={() => handleOpenPrivateMessage(user)}
                  >
                    Message
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className='room-info'>
            <h3>Room Info</h3>
            <p>Room ID: {roomId}</p>
            <p>Share this room ID with others to join!</p>
          </div>
        </div>

        <div className='chat-main'>
          {showPrivateMessageForm && (
            <div className="private-message-form">
              <h4>Send Private Message to {privateRecipient}</h4>
              <form onSubmit={handleSendPrivateMessage}>
                <textarea
                  value={privateMessage}
                  onChange={(e) => setPrivateMessage(e.target.value)}
                  placeholder="Type your private message..."
                  required
                />
                <div className="form-actions">
                  <button type="submit">Send</button>
                  <button 
                    type="button" 
                    onClick={() => setShowPrivateMessageForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className='messages-container'>
            {messages.length === 0 ? (
              <div className='no-messages'>
                No messages yet. Be the first to say hello!
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`message ${
                    msg.type === "system"
                      ? "system"
                      : msg.type === "private"
                      ? "private"
                      : msg.sender === username
                      ? "sent"
                      : "received"
                  } ${msg.isDeleted ? "deleted" : ""}`}
                >
                  {msg.type !== "system" && (
                    <div className="message-header">
                      <span className='sender'>
                        {msg.type === "private" ? `${msg.sender} → ${msg.recipient} (Private)` : msg.sender}
                      </span>
                      <span className='timestamp'>
                        {formatTimestamp(msg.timestamp)}
                        {msg.isEdited && <span className="edited-indicator"> (edited)</span>}
                      </span>
                    </div>
                  )}
                  
                  {editingMessage === msg._id ? (
                    <div className="edit-message-form">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                      />
                      <div className="edit-actions">
                        <button onClick={handleSubmitEdit}>Save</button>
                        <button onClick={() => setEditingMessage(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p>{msg.text}</p>
                      
                      {msg.type === "file" && (
                        <div className="file-attachment">
                          <a 
                            href={`http://localhost:5000${msg.fileUrl}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            {msg.fileName} ({(msg.fileSize / 1024).toFixed(1)} KB)
                          </a>
                        </div>
                      )}
                      
                      {/* Message reactions */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className="message-reactions">
                          {Array.from(new Set(msg.reactions.map(r => r.emoji))).map(emoji => {
                            const count = msg.reactions.filter(r => r.emoji === emoji).length;
                            const users = msg.reactions.filter(r => r.emoji === emoji).map(r => r.user);
                            return (
                              <span 
                                key={emoji} 
                                className="reaction-badge"
                                title={`${users.join(", ")}`}
                              >
                                {emoji} {count}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      
                      {/* Read receipts */}
                      {msg.sender === username && msg.readBy && msg.readBy.length > 0 && (
                        <div className="read-receipts">
                          Read by: {msg.readBy.map(r => r.user).filter(u => u !== username).join(", ")}
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* Message actions */}
                  {msg.sender === username && msg.type !== "system" && !msg.isDeleted && !editingMessage && (
                    <div className="message-actions">
                      <button onClick={() => handleEditMessage(msg)}>Edit</button>
                      <button onClick={() => handleDeleteMessage(msg._id)}>Delete</button>
                    </div>
                  )}
                  
                  {/* Reaction button */}
                  {msg.type !== "system" && (
                    <div className="reaction-controls">
                      {showEmojiPicker === msg._id ? (
                        <div className="emoji-picker">
                          {commonEmojis.map(emoji => (
                            <button 
                              key={emoji} 
                              onClick={() => handleAddReaction(msg._id, emoji)}
                              className="emoji-button"
                            >
                              {emoji}
                            </button>
                          ))}
                          <button 
                            onClick={() => setShowEmojiPicker(false)}
                            className="close-emoji-picker"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setShowEmojiPicker(msg._id)}
                          className="add-reaction-button"
                        >
                          Add Reaction
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            {typingUsers.length > 0 && (
              <div className='typing-indicator'>
                {typingUsers.join(", ")}{" "}
                {typingUsers.length === 1 ? "is" : "are"} typing...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="message-input-container">
            <div className="file-upload-container">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                id="file-upload"
                className="file-input"
              />
              <label htmlFor="file-upload" className="file-upload-label">
                {selectedFile ? selectedFile.name : "Attach File"}
              </label>
              {selectedFile && (
                <button 
                  onClick={handleFileUpload}
                  disabled={isUploading}
                  className="upload-button"
                >
                  {isUploading ? "Uploading..." : "Upload"}
                </button>
              )}
            </div>
            
            <form className='message-form' onSubmit={handleSendMessage}>
              <input
                type='text'
                placeholder='Type a message...'
                value={message}
                onChange={handleTyping}
              />
              <button type='submit'>Send</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatRoom;