import { useEffect } from 'react';
import { io } from 'socket.io-client';

type WorkflowStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED';

export type WorkflowStatusUpdate = {
  runId: string;
  status: WorkflowStatus;
};

type UseWorkflowUpdatesOptions = {
  onStatusChange: (update: WorkflowStatusUpdate) => void;
};

const WEBSOCKET_URL =
  process.env.NEXT_PUBLIC_WEBSOCKET_URL?.trim();

export function useWorkflowUpdates({
  onStatusChange,
}: UseWorkflowUpdatesOptions) {
  useEffect(() => {
    // No configured WebSocket endpoint:
    // do not attempt a connection.
    if (!WEBSOCKET_URL) {
      return;
    }

    const socket = io(WEBSOCKET_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      console.log(
        'Workflow Updates WebSocket connected:',
        socket.id,
      );
    });

    socket.on(
      'workflow.status.changed',
      (data: WorkflowStatusUpdate) => {
        onStatusChange(data);
      },
    );

    socket.on('connect_error', (error) => {
      console.error(
        'Workflow Updates WebSocket error:',
        error.message,
      );
    });

    return () => {
      socket.off('workflow.status.changed');
      socket.off('connect');
      socket.off('connect_error');
      socket.disconnect();
    };
  }, [onStatusChange]);
}