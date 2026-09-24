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
  process.env.NEXT_PUBLIC_WEBSOCKET_URL ??
  'http://localhost:3000';

export function useWorkflowUpdates({
  onStatusChange,
}: UseWorkflowUpdatesOptions) {
  useEffect(() => {
    const socket = io(WEBSOCKET_URL, {
      transports: ['websocket'],
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