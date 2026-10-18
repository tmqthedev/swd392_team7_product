import { io } from 'socket.io-client';

export function createInterviewSocket() {
  return io('/interview', {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    autoConnect: false,
  });
}
