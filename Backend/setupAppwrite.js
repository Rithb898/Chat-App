// setupAppwrite.js - Script to initialize Appwrite database and collections
const { Client, Databases, ID } = require('node-appwrite');

// Initialize Appwrite Client
const client = new Client()
    .setEndpoint('https://cloud.appwrite.io/v1') // Replace with your Appwrite endpoint
    .setProject('6784bc290038399aac0e')               // Replace with your project ID
    .setKey('standard_afd724c51f4750788acd33f6f42fbd58af9a0ea5ab979b756bb7c24a3fcc532c3b99c7fd0f4721aac706d1cd286117e5d1e31a5a67c507f2a0a29599a4e3d5a7e85216b4fe6433c5c00b9d9a6bb4b45bdad6acf693e4dd2a8b773f45a96270e6896e6cc1e512e43ebaf492387fb2ce773f8cd03e2cf5ee3d5e793e9369c63e36');                     // Replace with your API key

const databases = new Databases(client);

// Database and Collection IDs
const DATABASE_ID = '67d8641f001b6af9c2cd';
const ROOMS_COLLECTION_ID = '67d8642b002c0aee313c';
const MESSAGES_COLLECTION_ID = '67d864360032ddc69307';
const USERS_COLLECTION_ID = '67d864430002db4f1a14';

async function setupAppwrite() {
    try {
        console.log('Setting up Appwrite database and collections...');

        // Create database if it doesn't exist
        try {
            await databases.get(DATABASE_ID);
            console.log(`Database ${DATABASE_ID} already exists.`);
        } catch (error) {
            if (error.code === 404) {
                await databases.create(DATABASE_ID, DATABASE_ID, 'Chat Application Database');
                console.log(`Database ${DATABASE_ID} created successfully.`);
            } else {
                throw error;
            }
        }

        // Create Rooms collection if it doesn't exist
        try {
            await databases.getCollection(DATABASE_ID, ROOMS_COLLECTION_ID);
            console.log(`Collection ${ROOMS_COLLECTION_ID} already exists.`);
        } catch (error) {
            if (error.code === 404) {
                await databases.createCollection(
                    DATABASE_ID,
                    ROOMS_COLLECTION_ID,
                    'Chat Rooms',
                    [
                        { required: true, label: 'Created At', key: 'createdAt', type: 'string', default: 'now()' },
                        { required: true, label: 'Last Activity', key: 'lastActivity', type: 'string', default: 'now()' },
                        { required: false, label: 'Is Empty', key: 'isEmpty', type: 'boolean', default: false }
                    ],
                    ['createdAt', 'lastActivity']
                );
                console.log(`Collection ${ROOMS_COLLECTION_ID} created successfully.`);
            } else {
                throw error;
            }
        }

        // Create Messages collection if it doesn't exist
        try {
            await databases.getCollection(DATABASE_ID, MESSAGES_COLLECTION_ID);
            console.log(`Collection ${MESSAGES_COLLECTION_ID} already exists.`);
        } catch (error) {
            if (error.code === 404) {
                await databases.createCollection(
                    DATABASE_ID,
                    MESSAGES_COLLECTION_ID,
                    'Chat Messages',
                    [
                        { required: true, label: 'Type', key: 'type', type: 'string', array: false },
                        { required: false, label: 'Sender', key: 'sender', type: 'string', array: false },
                        { required: true, label: 'Text', key: 'text', type: 'string', array: false },
                        { required: true, label: 'Room ID', key: 'roomId', type: 'string', array: false },
                        { required: true, label: 'Timestamp', key: 'timestamp', type: 'string', default: 'now()' }
                    ],
                    ['roomId', 'timestamp']
                );
                console.log(`Collection ${MESSAGES_COLLECTION_ID} created successfully.`);
            } else {
                throw error;
            }
        }

        // Create Users collection if it doesn't exist
        try {
            await databases.getCollection(DATABASE_ID, USERS_COLLECTION_ID);
            console.log(`Collection ${USERS_COLLECTION_ID} already exists.`);
        } catch (error) {
            if (error.code === 404) {
                await databases.createCollection(
                    DATABASE_ID,
                    USERS_COLLECTION_ID,
                    'Room Users',
                    [
                        { required: true, label: 'Socket ID', key: 'socketId', type: 'string', array: false },
                        { required: true, label: 'Username', key: 'username', type: 'string', array: false },
                        { required: true, label: 'Room ID', key: 'roomId', type: 'string', array: false },
                        { required: true, label: 'Joined At', key: 'joinedAt', type: 'string', default: 'now()' }
                    ],
                    ['roomId', 'socketId', 'username']
                );
                console.log(`Collection ${USERS_COLLECTION_ID} created successfully.`);
            } else {
                throw error;
            }
        }

        console.log('Appwrite setup completed successfully!');
    } catch (error) {
        console.error('Error setting up Appwrite:', error);
    }
}

setupAppwrite();