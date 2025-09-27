const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const PlatformUtils = require('../utils/platform');

/**
 * Codex CLI wrapper service with cross-platform support
 */
class CodexService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.codexCommand = options.codexPath || PlatformUtils.getCodexCommand();
        this.mockMode = options.mockMode || process.env.MOCK_CODEX === 'true';
        this.activeTasks = new Map();
        this.taskCounter = 0;
    }

    /**
     * Execute a Codex task
     * @param {Object} taskSpec - Task specification
     * @param {string} taskSpec.prompt - The task prompt
     * @param {string} taskSpec.workingDir - Working directory
     * @param {string} taskSpec.approvalMode - 'suggest', 'auto-edit', or 'full-auto'
     * @param {boolean} taskSpec.json - Whether to use JSON output
     * @returns {Promise<Object>} Task execution result
     */
    async executeTask(taskSpec) {
        const taskId = this.generateTaskId();
        const task = {
            id: taskId,
            prompt: taskSpec.prompt,
            workingDir: taskSpec.workingDir || process.cwd(),
            approvalMode: taskSpec.approvalMode || 'suggest',
            status: 'starting',
            startTime: new Date(),
            logs: []
        };

        this.activeTasks.set(taskId, task);
        this.emit('taskCreated', { taskId, task });

        try {
            // Validate and sanitize working directory
            task.workingDir = PlatformUtils.sanitizePath(task.workingDir);

            if (this.mockMode) {
                return await this.executeMockTask(task);
            } else {
                return await this.executeRealTask(task);
            }
        } catch (error) {
            task.status = 'failed';
            task.error = error.message;
            task.endTime = new Date();
            this.emit('taskFailed', { taskId, error: error.message });
            throw error;
        }
    }

    /**
     * Execute a real Codex CLI task
     */
    async executeRealTask(task) {
        return new Promise((resolve, reject) => {
            // Build command as a single string for better shell compatibility
            let command = `${this.codexCommand} exec --json`;
            
            // Add approval mode based on task configuration
            if (task.approvalMode === 'full-auto') {
                command += ' --full-auto';
            } else if (task.approvalMode === 'danger') {
                command += ' --dangerously-bypass-approvals-and-sandbox';
            }
            // Default is suggest mode (interactive)
            
            // Add working directory if specified
            if (task.workingDir && task.workingDir !== process.cwd()) {
                command += ` -C "${task.workingDir}"`;
            }
            
            // Add the prompt (properly quoted)
            command += ` "${task.prompt.replace(/"/g, '\\"')}"`;

            // Debug logging
            console.log('Executing Codex CLI command:', command);

            const codexProcess = spawn(command, [], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env },
                shell: true
            });

            task.status = 'running';
            task.processId = codexProcess.pid;
            this.emit('taskStarted', { taskId: task.id, task });

            let jsonBuffer = '';
            let errorBuffer = '';

            codexProcess.stdout.on('data', (data) => {
                const chunk = data.toString();
                jsonBuffer += chunk;
                
                // Try to parse individual JSON lines
                const lines = jsonBuffer.split('\\n');
                jsonBuffer = lines.pop(); // Keep incomplete line

                lines.forEach(line => {
                    if (line.trim()) {
                        try {
                            const event = JSON.parse(line);
                            this.handleCodexEvent(task.id, event);
                            
                            // Emit real-time thinking events
                            this.emitCodexThinkingEvents(task.id, event);
                        } catch (e) {
                            // Not JSON, treat as regular log
                            this.addTaskLog(task.id, 'stdout', line);
                        }
                    }
                });
            });

            codexProcess.stderr.on('data', (data) => {
                const chunk = data.toString();
                errorBuffer += chunk;
                this.addTaskLog(task.id, 'stderr', chunk);
            });

            codexProcess.on('close', (code) => {
                task.status = code === 0 ? 'completed' : 'failed';
                task.endTime = new Date();
                task.exitCode = code;

                if (code === 0) {
                    this.emit('taskCompleted', { taskId: task.id, task });
                    resolve(task);
                } else {
                    task.error = errorBuffer || `Process exited with code ${code}`;
                    this.emit('taskFailed', { taskId: task.id, error: task.error });
                    reject(new Error(task.error));
                }
            });

            codexProcess.on('error', (error) => {
                task.status = 'failed';
                task.error = error.message;
                task.endTime = new Date();
                this.emit('taskFailed', { taskId: task.id, error: error.message });
                reject(error);
            });
        });
    }

    /**
     * Execute a mock task for development/testing
     */
    async executeMockTask(task) {
        task.status = 'running';
        this.emit('taskStarted', { taskId: task.id, task });

        // Simulate processing with mock events
        const mockEvents = [
            { type: 'thinking', message: 'Analyzing task requirements...' },
            { type: 'planning', message: 'Creating execution plan...' },
            { type: 'executing', message: 'Performing requested actions...' },
            { type: 'progress', progress: 50, message: 'Halfway complete...' },
            { type: 'progress', progress: 100, message: 'Task completed successfully' }
        ];

        for (const event of mockEvents) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            this.handleCodexEvent(task.id, event);
        }

        task.status = 'completed';
        task.endTime = new Date();
        task.result = `Mock execution completed for: ${task.prompt}`;
        
        this.emit('taskCompleted', { taskId: task.id, task });
        return task;
    }

    /**
     * Handle Codex CLI JSON events
     */
    handleCodexEvent(taskId, event) {
        const task = this.activeTasks.get(taskId);
        if (!task) return;

        task.logs.push({
            timestamp: new Date(),
            type: 'event',
            data: event
        });

        // Update task status based on event type
        if (event.type === 'approval_required') {
            task.status = 'waiting_approval';
            task.pendingApproval = event;
        } else if (event.type === 'completed') {
            task.status = 'completed';
            task.result = event.result;
        } else if (event.type === 'error') {
            task.status = 'failed';
            task.error = event.message;
        }

        this.emit('taskProgress', { taskId, event });
    }

    /**
     * Add a log entry to a task
     */
    addTaskLog(taskId, type, message) {
        const task = this.activeTasks.get(taskId);
        if (!task) return;

        task.logs.push({
            timestamp: new Date(),
            type,
            message
        });

        this.emit('taskLog', { taskId, type, message });
    }

    /**
     * Emit real-time Codex thinking events
     */
    emitCodexThinkingEvents(taskId, codexEvent) {
        if (!codexEvent.msg) return;

        const msg = codexEvent.msg;
        const timestamp = new Date();

        switch (msg.type) {
            case 'agent_reasoning':
                this.emit('thinkingStep', {
                    taskId,
                    type: 'thinking',
                    text: msg.text,
                    timestamp
                });
                break;

            case 'agent_reasoning_section_break':
                this.emit('thinkingStep', {
                    taskId,
                    type: 'section_break',
                    text: '--- New thinking section ---',
                    timestamp
                });
                break;

            case 'exec_command_begin':
                this.emit('commandEvent', {
                    taskId,
                    type: 'command_start',
                    command: msg.command,
                    workdir: msg.cwd,
                    timestamp
                });
                break;

            case 'exec_command_output_delta':
                // Decode base64 output
                let output = '';
                try {
                    output = Buffer.from(msg.chunk, 'base64').toString('utf8');
                } catch (e) {
                    output = msg.chunk;
                }
                
                this.emit('commandOutput', {
                    taskId,
                    type: 'command_output',
                    output,
                    stream: msg.stream,
                    timestamp
                });
                break;

            case 'exec_command_end':
                this.emit('commandEvent', {
                    taskId,
                    type: 'command_complete',
                    exitCode: msg.metadata?.exit_code,
                    duration: msg.metadata?.duration_seconds,
                    timestamp
                });
                break;

            case 'token_count':
                this.emit('tokenUpdate', {
                    taskId,
                    type: 'token_usage',
                    tokenInfo: msg.info,
                    rateLimits: msg.rate_limits,
                    timestamp
                });
                break;

            case 'agent_message':
                this.emit('agentMessage', {
                    taskId,
                    type: 'agent_response',
                    message: msg.message,
                    timestamp
                });
                break;
        }
    }

    /**
     * Approve a pending task
     */
    async approveTask(taskId, approved = true) {
        const task = this.activeTasks.get(taskId);
        if (!task || task.status !== 'waiting_approval') {
            throw new Error('Task not found or not waiting for approval');
        }

        // In a real implementation, this would send approval to the Codex process
        // For now, we'll simulate the approval
        if (approved) {
            task.status = 'running';
            this.emit('taskApproved', { taskId });
        } else {
            task.status = 'cancelled';
            this.emit('taskCancelled', { taskId });
        }

        return task;
    }

    /**
     * Cancel a running task
     */
    async cancelTask(taskId) {
        const task = this.activeTasks.get(taskId);
        if (!task) {
            throw new Error('Task not found');
        }

        if (task.processId) {
            try {
                process.kill(task.processId, 'SIGTERM');
            } catch (error) {
                // Process might already be dead
            }
        }

        task.status = 'cancelled';
        task.endTime = new Date();
        this.emit('taskCancelled', { taskId });
        
        return task;
    }

    /**
     * Get task information
     */
    getTask(taskId) {
        return this.activeTasks.get(taskId);
    }

    /**
     * Get all tasks
     */
    getAllTasks() {
        return Array.from(this.activeTasks.values());
    }

    /**
     * Generate a unique task ID
     */
    generateTaskId() {
        return `task_${Date.now()}_${++this.taskCounter}`;
    }

    /**
     * Clean up completed tasks
     */
    cleanupOldTasks(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
        const now = new Date();
        
        for (const [taskId, task] of this.activeTasks.entries()) {
            if (task.endTime && (now - task.endTime) > maxAge) {
                this.activeTasks.delete(taskId);
            }
        }
    }

    /**
     * Check if Codex CLI is available
     */
    async checkCodexAvailability() {
        if (this.mockMode) {
            return { available: true, version: 'mock', path: 'mock' };
        }

        return new Promise((resolve) => {
            const checkProcess = spawn(this.codexCommand, ['--version'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            checkProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            checkProcess.on('close', (code) => {
                resolve({
                    available: code === 0,
                    version: output.trim(),
                    path: this.codexCommand
                });
            });

            checkProcess.on('error', () => {
                resolve({
                    available: false,
                    error: 'Codex CLI not found',
                    path: this.codexCommand
                });
            });
        });
    }
}

module.exports = CodexService;