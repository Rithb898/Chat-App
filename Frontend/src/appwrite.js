import { Client, Account, Databases, ID, Query } from 'appwrite';

const client = new Client();

// Initialize Appwrite client
client
    .setEndpoint('https://cloud.appwrite.io/v1') // Replace with your Appwrite endpoint
    .setProject('6784bc290038399aac0e'); // Replace with your project ID

// Export Appwrite services
export const account = new Account(client);
export const databases = new Databases(client);

// Database and collection IDs
export const DATABASE_ID = '67d8641f001b6af9c2cd';
export const ROOMS_COLLECTION_ID = '67d8642b002c0aee313c';
export const MESSAGES_COLLECTION_ID = '67d864360032ddc69307';
export const USERS_COLLECTION_ID = '67d864430002db4f1a14';

// Auth functions
export const createAccount = async (email, password, name) => {
    try {
        const response = await account.create(ID.unique(), email, password, name);
        if (response) {
            // Login immediately after account creation
            return await login(email, password);
        }
        return response;
    } catch (error) {
        console.error("Appwrite createAccount error:", error);
        throw error;
    }
};

export const login = async (email, password) => {
    try {
        return await account.createEmailSession(email, password);
    } catch (error) {
        console.error("Appwrite login error:", error);
        throw error;
    }
};

export const logout = async () => {
    try {
        return await account.deleteSession('current');
    } catch (error) {
        console.error("Appwrite logout error:", error);
        throw error;
    }
};

export const getCurrentUser = async () => {
    try {
        return await account.get();
    } catch (error) {
        console.error("Appwrite getCurrentUser error:", error);
        return null;
    }
};

// Database functions
export const createRoom = async (roomId, createdBy) => {
    try {
        // Check if room exists
        try {
            return await databases.getDocument(DATABASE_ID, ROOMS_COLLECTION_ID, roomId);
        } catch (error) {
            // Create new room if it doesn't exist
            return await databases.createDocument(
                DATABASE_ID,
                ROOMS_COLLECTION_ID,
                roomId,
                {
                    createdBy,
                    createdAt: new Date().toISOString(),
                    lastActivity: new Date().toISOString()
                }
            );
        }
    } catch (error) {
        console.error("Appwrite createRoom error:", error);
        throw error;
    }
};

// Save message to database (for persistence)
export const saveMessage = async (roomId, userId, username, messageText, type = 'user') => {
    try {
        const response = await databases.createDocument(
            DATABASE_ID,
            MESSAGES_COLLECTION_ID,
            ID.unique(),
            {
                roomId,
                userId,
                sender: username,
                text: messageText,
                type,
                timestamp: new Date().toISOString()
            }
        );

        // Update room's lastActivity
        await databases.updateDocument(
            DATABASE_ID,
            ROOMS_COLLECTION_ID,
            roomId,
            {
                lastActivity: new Date().toISOString()
            }
        );

        return response;
    } catch (error) {
        console.error("Appwrite saveMessage error:", error);
        throw error;
    }
};

// Get room message history
export const getRoomMessages = async (roomId, limit = 100) => {
    try {
        const response = await databases.listDocuments(
            DATABASE_ID,
            MESSAGES_COLLECTION_ID,
            [
                Query.equal('roomId', roomId),
                Query.orderDesc('timestamp'),
                Query.limit(limit)
            ]
        );
        return response.documents.reverse();
    } catch (error) {
        console.error("Appwrite getRoomMessages error:", error);
        return [];
    }
};