import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('✅ Connected!');
  console.log('Socket ID:', socket.id);

  socket.emit('message', {
    text: 'Hello from EWAP client',
  });
});

socket.on('workflow.status.changed', (data) => {
  console.log('📡 Status update:', data);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
});