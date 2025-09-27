const { Server } = require('socket.io');

/**
 * WebSocket service for real-time communication
 */
class WebSocketService {
    constructor(server, options = {}) {
        this.io = new Server(server, {
            cors: {
                origin: options.corsOrigins || ["http://localhost:3000", "http://localhost:8080"],
                methods: ["GET", "POST"]
            },
            transports: ['websocket', 'polling']
        });

        this.connectedClients = new Set();
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`Client connected: ${socket.id}`);
            this.connectedClients.add(socket.id);

            // Send welcome message with current server status
            socket.emit('welcome', {
                message: 'Connected to Conductor Backend',
                clientId: socket.id,
                timestamp: new Date().toISOString()
            });

            // Handle client disconnection
            socket.on('disconnect', (reason) => {
                console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
                this.connectedClients.delete(socket.id);
            });

            // Handle ping/pong for connection health
            socket.on('ping', () => {
                socket.emit('pong', { timestamp: new Date().toISOString() });
            });

            // Handle client subscription to specific task updates
            socket.on('subscribe_task', (taskId) => {
                socket.join(`task:${taskId}`);
                socket.emit('subscribed', { taskId });
            });

            socket.on('unsubscribe_task', (taskId) => {
                socket.leave(`task:${taskId}`);
                socket.emit('unsubscribed', { taskId });
            });

            // Handle general subscription to all task updates
            socket.on('subscribe_all_tasks', () => {
                socket.join('all_tasks');
                socket.emit('subscribed_all_tasks');
            });

            socket.on('unsubscribe_all_tasks', () => {
                socket.leave('all_tasks');
                socket.emit('unsubscribed_all_tasks');
            });

            // Error handling
            socket.on('error', (error) => {
                console.error(`Socket error for ${socket.id}:`, error);
            });
        });
    }

    /**
     * Connect Codex service events to WebSocket broadcasts
     */
    connectCodexService(codexService) {
        // Task lifecycle events
        codexService.on('taskCreated', (data) => {
            this.broadcastTaskEvent('task_created', data);
        });

        codexService.on('taskStarted', (data) => {
            this.broadcastTaskEvent('task_started', data);
        });

        codexService.on('taskProgress', (data) => {
            this.broadcastTaskEvent('task_progress', data);
        });

        codexService.on('taskCompleted', (data) => {
            this.broadcastTaskEvent('task_completed', data);
        });

        codexService.on('taskFailed', (data) => {
            this.broadcastTaskEvent('task_failed', data);
        });

        codexService.on('taskCancelled', (data) => {
            this.broadcastTaskEvent('task_cancelled', data);
        });

        codexService.on('taskApproved', (data) => {
            this.broadcastTaskEvent('task_approved', data);
        });

        codexService.on('taskLog', (data) => {
            this.broadcastTaskEvent('task_log', data);
        });

        // Real-time Codex thinking events
        codexService.on('thinkingStep', (data) => {
            this.broadcastTaskEvent('thinking_step', data);
        });

        codexService.on('commandEvent', (data) => {
            this.broadcastTaskEvent('command_event', data);
        });

        codexService.on('commandOutput', (data) => {
            this.broadcastTaskEvent('command_output', data);
        });

        codexService.on('tokenUpdate', (data) => {
            this.broadcastTaskEvent('token_update', data);
        });

        codexService.on('agentMessage', (data) => {
            this.broadcastTaskEvent('agent_message', data);
        });
    }

    /**
     * Broadcast task event to relevant clients
     */
    broadcastTaskEvent(eventType, data) {
        const payload = {
            type: eventType,
            timestamp: new Date().toISOString(),
            ...data
        };

        // Send to clients subscribed to all tasks
        this.io.to('all_tasks').emit('task_event', payload);

        // Send to clients subscribed to specific task
        if (data.taskId) {
            this.io.to(`task:${data.taskId}`).emit('task_event', payload);
        }

        // Log the event for debugging
        console.log(`WebSocket broadcast: ${eventType} for task ${data.taskId || 'unknown'}`);
    }

    /**
     * Broadcast system event to all clients
     */
    broadcastSystemEvent(eventType, data) {
        const payload = {
            type: eventType,
            timestamp: new Date().toISOString(),
            ...data
        };

        this.io.emit('system_event', payload);
        console.log(`WebSocket system broadcast: ${eventType}`);
    }

    /**
     * Send message to specific client
     */
    sendToClient(clientId, event, data) {
        this.io.to(clientId).emit(event, {
            timestamp: new Date().toISOString(),
            ...data
        });
    }

    /**
     * Get connection statistics
     */
    getStats() {
        return {
            connectedClients: this.connectedClients.size,
            rooms: Object.keys(this.io.sockets.adapter.rooms),
            uptime: process.uptime()
        };
    }

    /**
     * Close all connections and shutdown
     */
    shutdown() {
        console.log('Shutting down WebSocket service...');
        this.io.close();
    }
}

module.exports = WebSocketService;