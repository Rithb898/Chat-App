import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import io from 'socket.io-client';

const socket = io("http://localhost:5000");

function Home() {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for room existence check results
    socket.on('roomExists', (exists) => {
      if (exists) {
        navigate(`/${roomId}`, { state: { username } });
      } else {
        setError("Room not found. Please check the Room ID.");
        setTimeout(() => setError(null), 5000);
      }
    });

    return () => {
      socket.off('roomExists');
    };
  }, [roomId, username, navigate]);

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    
    // Generate a unique room ID
    const newRoomId = uuidv4().substring(0, 8);
    navigate(`/${newRoomId}`, { state: { username } });
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!username.trim() || !roomId.trim()) return;
    
    // Check if room exists before navigating
    socket.emit('getRoomInfo', roomId);
  };

  return (
    <div className="home-container">
      <div className="home-card">
        <h1>Socket.IO Chat Rooms</h1>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        <div className="form-container">
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
            />
          </div>
          
          <div className="button-group">
            <button 
              className="create-room-btn"
              onClick={handleCreateRoom}
              disabled={!username.trim()}
            >
              Create New Room
            </button>
            
            <div className="separator">OR</div>
            
            <div className="join-form">
              <div className="input-group">
                <label htmlFor="roomId">Room ID</label>
                <input
                  type="text"
                  id="roomId"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="Enter room ID"
                />
              </div>
              <button 
                className="join-room-btn"
                onClick={handleJoinRoom}
                disabled={!username.trim() || !roomId.trim()}
              >
                Join Room
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;