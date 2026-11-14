import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken } from '../lib/auth/auth';

type WorkflowStatus =
  'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export type WorkflowStatusUpdate = {
  runId: string;
  status: WorkflowStatus;
};

type UseWorkflowUpdatesOptions = {
  onStatusChange: (update: WorkflowStatusUpdate) => void;
  onResync: () => void;
};

const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL?.trim();

export function useWorkflowUpdates({
  onStatusChange,
  onResync,
}: UseWorkflowUpdatesOptions) {
  useEffect(() => {
    // No configured WebSocket endpoint:
    // do not attempt a connection.
    if (!WEBSOCKET_URL || !getAccessToken()) {
      return;
    }

    const socket = io(WEBSOCKET_URL, {
      // Read again on reconnect; never put credentials or tenant IDs in the URL.
      auth: (callback) => callback({ token: getAccessToken() }),
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      console.log('Workflow Updates WebSocket connected:', socket.id);
    });

    socket.on('workflow.status.changed', (data: WorkflowStatusUpdate) => {
      onStatusChange(data);
      onResync();
    });

    socket.on('workflow.updates.ready', onResync);
    socket.on('workflow.updates.resync', onResync);

    socket.on('connect_error', (error) => {
      console.error('Workflow Updates WebSocket error:', error.message);
    });

    return () => {
      socket.off('workflow.status.changed');
      socket.off('workflow.updates.ready');
      socket.off('workflow.updates.resync');
      socket.off('connect');
      socket.off('connect_error');
      socket.disconnect();
    };
  }, [onStatusChange, onResync]);
}
