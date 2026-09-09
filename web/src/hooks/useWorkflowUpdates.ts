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

export function useWorkflowUpdates({
  onStatusChange,
}: UseWorkflowUpdatesOptions) {
  useEffect(() => {
    const socket = io('http://localhost:3000', {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log(
        '🔌 Workflow Updates WebSocket connected:',
        socket.id,
      );
    });

    socket.on(
      'workflow.status.changed',
      (data: WorkflowStatusUpdate) => {
        console.log('📡 Workflow status update:', data);

        onStatusChange(data);
      },
    );

    socket.on('connect_error', (error) => {
      console.error(
        '❌ Workflow Updates WebSocket error:',
        error.message,
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [onStatusChange]);
}