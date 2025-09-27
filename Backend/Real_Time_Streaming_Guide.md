# Real-Time Codex Thinking Streaming Guide

This guide shows how to receive real-time Codex AI thinking steps as they happen during task execution.

## 🧠 **What You'll Get in Real-Time:**

1. **Thinking Steps** - Codex reasoning process
2. **Command Execution** - When Codex runs commands
3. **Live Output** - Terminal output as it happens
4. **Token Usage** - API consumption tracking
5. **Agent Messages** - Final responses

---

## 🔌 **WebSocket Events Reference**

### **Core Task Events:**
- `task_created` - Task started
- `task_started` - Execution began
- `task_completed` - Task finished
- `task_failed` - Task error

### **NEW: Real-Time Thinking Events:**
- `thinking_step` - Codex reasoning process
- `command_event` - Command start/completion
- `command_output` - Live terminal output
- `token_update` - API usage tracking
- `agent_message` - Final AI response

---

## 🚀 **Frontend Implementation**

### **JavaScript/React Complete Example:**

```javascript
import io from 'socket.io-client';
import { useState, useEffect, useRef } from 'react';

class ConductorStreaming {
  constructor() {
    this.socket = io('http://localhost:3001');
    this.setupEventHandlers();
  }

  async createStreamingTask(prompt, workingDir, approvalMode = 'suggest') {
    // Create task via REST API
    const response = await fetch('http://localhost:3001/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, workingDir, approvalMode })
    });
    
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    
    const taskId = result.data.taskId;
    
    // Subscribe to real-time events for this task
    this.socket.emit('subscribe_task', taskId);
    
    return taskId;
  }

  setupEventHandlers() {
    this.socket.on('connect', () => {
      console.log('🔌 Connected to Conductor Backend');
      this.onConnectionChange?.(true);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from backend');
      this.onConnectionChange?.(false);
    });

    // Listen for all task events
    this.socket.on('task_event', (event) => {
      this.handleTaskEvent(event);
    });
  }

  handleTaskEvent(event) {
    console.log('📡 WebSocket Event:', event.type, event);

    switch(event.type) {
      case 'task_created':
        this.onTaskCreated?.(event);
        break;
        
      case 'task_started':
        this.onTaskStarted?.(event);
        break;

      // 🧠 REAL-TIME THINKING
      case 'thinking_step':
        this.onThinkingStep?.({
          taskId: event.taskId,
          type: event.data.type, // 'thinking' or 'section_break'
          text: event.data.text,
          timestamp: new Date(event.timestamp)
        });
        break;

      // ⚡ COMMAND EXECUTION
      case 'command_event':
        if (event.data.type === 'command_start') {
          this.onCommandStart?.({
            taskId: event.taskId,
            command: event.data.command,
            workdir: event.data.workdir,
            timestamp: new Date(event.timestamp)
          });
        } else if (event.data.type === 'command_complete') {
          this.onCommandComplete?.({
            taskId: event.taskId,
            exitCode: event.data.exitCode,
            duration: event.data.duration,
            timestamp: new Date(event.timestamp)
          });
        }
        break;

      // 📟 LIVE TERMINAL OUTPUT
      case 'command_output':
        this.onCommandOutput?.({
          taskId: event.taskId,
          output: event.data.output,
          stream: event.data.stream, // 'stdout' or 'stderr'
          timestamp: new Date(event.timestamp)
        });
        break;

      // 🔢 TOKEN USAGE
      case 'token_update':
        this.onTokenUpdate?.({
          taskId: event.taskId,
          tokenInfo: event.data.tokenInfo,
          rateLimits: event.data.rateLimits,
          timestamp: new Date(event.timestamp)
        });
        break;

      // 💬 FINAL AI RESPONSE
      case 'agent_message':
        this.onAgentMessage?.({
          taskId: event.taskId,
          message: event.data.message,
          timestamp: new Date(event.timestamp)
        });
        break;

      case 'task_completed':
        this.onTaskCompleted?.(event);
        break;

      case 'task_failed':
        this.onTaskFailed?.(event);
        break;
    }
  }

  // Event callbacks - override these in your app
  onConnectionChange = null;
  onTaskCreated = null;
  onTaskStarted = null;
  onThinkingStep = null;
  onCommandStart = null;
  onCommandOutput = null;
  onCommandComplete = null;
  onTokenUpdate = null;
  onAgentMessage = null;
  onTaskCompleted = null;
  onTaskFailed = null;
}

// React Component Example
function AIThinkingStreamer() {
  const [isConnected, setIsConnected] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState([]);
  const [commandOutput, setCommandOutput] = useState('');
  const [currentTask, setCurrentTask] = useState(null);
  const [tokenUsage, setTokenUsage] = useState(null);
  
  const streaming = useRef(new ConductorStreaming());

  useEffect(() => {
    const conductor = streaming.current;
    
    // Connection status
    conductor.onConnectionChange = setIsConnected;
    
    // Task lifecycle
    conductor.onTaskStarted = (event) => {
      setCurrentTask(event.taskId);
      setThinkingSteps([]);
      setCommandOutput('');
      console.log('🚀 Task started:', event.taskId);
    };
    
    // 🧠 REAL-TIME AI THINKING
    conductor.onThinkingStep = (step) => {
      setThinkingSteps(prev => [...prev, {
        id: Date.now(),
        text: step.text,
        type: step.type,
        timestamp: step.timestamp
      }]);
    };
    
    // ⚡ COMMAND EXECUTION
    conductor.onCommandStart = (cmd) => {
      setThinkingSteps(prev => [...prev, {
        id: Date.now(),
        text: `🔧 Executing: ${cmd.command.join(' ')}`,
        type: 'command',
        timestamp: cmd.timestamp
      }]);
    };
    
    // 📟 LIVE TERMINAL OUTPUT
    conductor.onCommandOutput = (output) => {
      setCommandOutput(prev => prev + output.output);
    };
    
    // 🔢 TOKEN TRACKING
    conductor.onTokenUpdate = (usage) => {
      setTokenUsage(usage.tokenInfo);
    };
    
    // 💬 FINAL AI RESPONSE
    conductor.onAgentMessage = (msg) => {
      setThinkingSteps(prev => [...prev, {
        id: Date.now(),
        text: `✅ ${msg.message}`,
        type: 'final_response',
        timestamp: msg.timestamp
      }]);
    };
    
    // Task completion
    conductor.onTaskCompleted = (event) => {
      console.log('✅ Task completed:', event.taskId);
      setCurrentTask(null);
    };
    
    conductor.onTaskFailed = (event) => {
      console.log('❌ Task failed:', event.taskId);
      setCurrentTask(null);
    };
    
  }, []);

  const startTask = async () => {
    try {
      const taskId = await streaming.current.createStreamingTask(
        "analyze the files on my desktop and suggest organization improvements",
        "C:/Users/savbo/OneDrive/Desktop",
        "suggest"
      );
      console.log('Task created:', taskId);
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  return (
    <div className="ai-streaming-interface">
      <div className="header">
        <h1>🧠 AI Thinking Stream</h1>
        <div className="status">
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </div>
      </div>

      <div className="controls">
        <button onClick={startTask} disabled={currentTask || !isConnected}>
          {currentTask ? '⏳ Task Running...' : '🚀 Start AI Task'}
        </button>
      </div>

      {/* REAL-TIME THINKING DISPLAY */}
      <div className="thinking-stream">
        <h2>🧠 AI Thinking Process</h2>
        <div className="thinking-steps">
          {thinkingSteps.map((step) => (
            <div key={step.id} className={`thinking-step ${step.type}`}>
              <span className="timestamp">
                {step.timestamp.toLocaleTimeString()}
              </span>
              <span className="text">{step.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* LIVE COMMAND OUTPUT */}
      {commandOutput && (
        <div className="command-output">
          <h3>📟 Live Terminal Output</h3>
          <pre className="terminal">{commandOutput}</pre>
        </div>
      )}

      {/* TOKEN USAGE */}
      {tokenUsage && (
        <div className="token-info">
          <h3>🔢 Token Usage</h3>
          <p>Total: {tokenUsage.total_token_usage?.total_tokens || 'N/A'}</p>
        </div>
      )}
    </div>
  );
}

export default AIThinkingStreamer;
```

### **CSS for Styling:**

```css
.ai-streaming-interface {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.status {
  font-weight: bold;
  padding: 8px 16px;
  border-radius: 20px;
  background: #f0f0f0;
}

.thinking-stream {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  margin: 20px 0;
  max-height: 600px;
  overflow-y: auto;
}

.thinking-step {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #e0e0e0;
}

.thinking-step.thinking {
  background: linear-gradient(90deg, #e3f2fd 0%, transparent 100%);
  padding: 12px;
  border-radius: 8px;
  margin: 4px 0;
}

.thinking-step.command {
  background: linear-gradient(90deg, #fff3e0 0%, transparent 100%);
  padding: 12px;
  border-radius: 8px;
  margin: 4px 0;
}

.thinking-step.final_response {
  background: linear-gradient(90deg, #e8f5e8 0%, transparent 100%);
  padding: 12px;
  border-radius: 8px;
  margin: 4px 0;
  font-weight: bold;
}

.timestamp {
  color: #666;
  font-size: 0.85em;
  min-width: 80px;
}

.command-output {
  background: #1e1e1e;
  color: #00ff00;
  border-radius: 8px;
  padding: 16px;
  margin: 20px 0;
}

.terminal {
  font-family: 'Courier New', monospace;
  white-space: pre-wrap;
  max-height: 300px;
  overflow-y: auto;
}

.token-info {
  background: #f0f8ff;
  padding: 16px;
  border-radius: 8px;
  margin: 20px 0;
}
```

---

## 📱 **Swift/iOS Example:**

```swift
import SocketIO
import SwiftUI

class ConductorStreamingManager: ObservableObject {
    private var socket: SocketIOClient
    
    @Published var isConnected = false
    @Published var thinkingSteps: [ThinkingStep] = []
    @Published var commandOutput = ""
    @Published var currentTaskId: String? = nil
    @Published var tokenUsage: TokenUsage? = nil
    
    init() {
        let manager = SocketManager(socketURL: URL(string: "http://localhost:3001")!)
        self.socket = manager.defaultSocket
        setupEventHandlers()
        socket.connect()
    }
    
    func createStreamingTask(prompt: String, workingDir: String) async throws -> String {
        let url = URL(string: "http://localhost:3001/api/tasks")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = [
            "prompt": prompt,
            "workingDir": workingDir,
            "approvalMode": "suggest"
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        let result = try JSONDecoder().decode(APIResponse<TaskData>.self, from: data)
        
        let taskId = result.data.taskId
        
        // Subscribe to task events
        socket.emit("subscribe_task", taskId)
        
        DispatchQueue.main.async {
            self.currentTaskId = taskId
            self.thinkingSteps = []
            self.commandOutput = ""
        }
        
        return taskId
    }
    
    private func setupEventHandlers() {
        socket.on(clientEvent: .connect) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.isConnected = true
            }
        }
        
        socket.on(clientEvent: .disconnect) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.isConnected = false
            }
        }
        
        socket.on("task_event") { [weak self] data, _ in
            self?.handleTaskEvent(data: data)
        }
    }
    
    private func handleTaskEvent(data: [Any]) {
        guard let eventData = data.first as? [String: Any],
              let type = eventData["type"] as? String else { return }
        
        DispatchQueue.main.async {
            switch type {
            case "thinking_step":
                self.handleThinkingStep(eventData)
                
            case "command_event":
                self.handleCommandEvent(eventData)
                
            case "command_output":
                self.handleCommandOutput(eventData)
                
            case "token_update":
                self.handleTokenUpdate(eventData)
                
            case "agent_message":
                self.handleAgentMessage(eventData)
                
            case "task_completed":
                self.currentTaskId = nil
                
            case "task_failed":
                self.currentTaskId = nil
                
            default:
                break
            }
        }
    }
    
    private func handleThinkingStep(_ data: [String: Any]) {
        guard let eventData = data["data"] as? [String: Any],
              let text = eventData["text"] as? String,
              let stepType = eventData["type"] as? String else { return }
        
        let step = ThinkingStep(
            text: text,
            type: ThinkingStepType(rawValue: stepType) ?? .thinking,
            timestamp: Date()
        )
        
        thinkingSteps.append(step)
    }
    
    private func handleCommandEvent(_ data: [String: Any]) {
        guard let eventData = data["data"] as? [String: Any],
              let cmdType = eventData["type"] as? String else { return }
        
        if cmdType == "command_start",
           let command = eventData["command"] as? [String] {
            let step = ThinkingStep(
                text: "🔧 Executing: \\(command.joined(separator: " "))",
                type: .command,
                timestamp: Date()
            )
            thinkingSteps.append(step)
        }
    }
    
    private func handleCommandOutput(_ data: [String: Any]) {
        guard let eventData = data["data"] as? [String: Any],
              let output = eventData["output"] as? String else { return }
        
        commandOutput += output
    }
    
    private func handleTokenUpdate(_ data: [String: Any]) {
        guard let eventData = data["data"] as? [String: Any],
              let tokenInfo = eventData["tokenInfo"] as? [String: Any] else { return }
        
        // Parse token usage data
        // Implementation depends on your TokenUsage model
    }
    
    private func handleAgentMessage(_ data: [String: Any]) {
        guard let eventData = data["data"] as? [String: Any],
              let message = eventData["message"] as? String else { return }
        
        let step = ThinkingStep(
            text: "✅ \\(message)",
            type: .finalResponse,
            timestamp: Date()
        )
        
        thinkingSteps.append(step)
    }
}

struct ThinkingStep: Identifiable {
    let id = UUID()
    let text: String
    let type: ThinkingStepType
    let timestamp: Date
}

enum ThinkingStepType: String {
    case thinking = "thinking"
    case command = "command"
    case finalResponse = "final_response"
    case sectionBreak = "section_break"
}

// SwiftUI View
struct AIStreamingView: View {
    @StateObject private var streaming = ConductorStreamingManager()
    
    var body: some View {
        NavigationView {
            VStack {
                // Header
                HStack {
                    Text("🧠 AI Thinking Stream")
                        .font(.title)
                        .bold()
                    
                    Spacer()
                    
                    Text(streaming.isConnected ? "🟢 Connected" : "🔴 Disconnected")
                        .foregroundColor(streaming.isConnected ? .green : .red)
                }
                .padding()
                
                // Controls
                Button(action: startTask) {
                    Text(streaming.currentTaskId != nil ? "⏳ Task Running..." : "🚀 Start AI Task")
                        .font(.headline)
                        .foregroundColor(.white)
                        .padding()
                        .background(streaming.currentTaskId != nil ? Color.gray : Color.blue)
                        .cornerRadius(10)
                }
                .disabled(streaming.currentTaskId != nil || !streaming.isConnected)
                
                // Thinking Steps
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 8) {
                            ForEach(streaming.thinkingSteps) { step in
                                ThinkingStepView(step: step)
                                    .id(step.id)
                            }
                        }
                        .padding()
                    }
                    .onChange(of: streaming.thinkingSteps.count) { _ in
                        if let lastStep = streaming.thinkingSteps.last {
                            withAnimation {
                                proxy.scrollTo(lastStep.id, anchor: .bottom)
                            }
                        }
                    }
                }
                
                // Command Output
                if !streaming.commandOutput.isEmpty {
                    VStack(alignment: .leading) {
                        Text("📟 Live Terminal Output")
                            .font(.headline)
                            .padding(.horizontal)
                        
                        ScrollView {
                            Text(streaming.commandOutput)
                                .font(.system(.body, design: .monospaced))
                                .padding()
                        }
                        .frame(height: 200)
                        .background(Color.black.opacity(0.9))
                        .foregroundColor(.green)
                        .cornerRadius(8)
                        .padding(.horizontal)
                    }
                }
            }
        }
    }
    
    private func startTask() {
        Task {
            do {
                _ = try await streaming.createStreamingTask(
                    prompt: "analyze the files on my desktop and suggest improvements",
                    workingDir: "C:/Users/savbo/OneDrive/Desktop"
                )
            } catch {
                print("Failed to create task: \\(error)")
            }
        }
    }
}

struct ThinkingStepView: View {
    let step: ThinkingStep
    
    var body: some View {
        HStack(alignment: .top) {
            Text(step.timestamp, style: .time)
                .font(.caption)
                .foregroundColor(.secondary)
                .frame(width: 60)
            
            Text(step.text)
                .font(.body)
                .padding(.vertical, 4)
                .padding(.horizontal, 8)
                .background(backgroundColorForType(step.type))
                .cornerRadius(8)
            
            Spacer()
        }
    }
    
    private func backgroundColorForType(_ type: ThinkingStepType) -> Color {
        switch type {
        case .thinking:
            return Color.blue.opacity(0.1)
        case .command:
            return Color.orange.opacity(0.1)
        case .finalResponse:
            return Color.green.opacity(0.1)
        case .sectionBreak:
            return Color.gray.opacity(0.1)
        }
    }
}
```

---

## 🧪 **Testing the Real-Time Stream**

### **1. Start Your Backend:**
```bash
cd "C:\Users\savbo\OneDrive\Desktop\Conductor\Backend"
npm run dev
```

### **2. Test with Browser Console:**
```javascript
// Connect to WebSocket
const socket = io('http://localhost:3001');

// Subscribe to all task events
socket.emit('subscribe_all_tasks');

// Listen for thinking events
socket.on('task_event', (event) => {
  if (event.type === 'thinking_step') {
    console.log('🧠 AI Thinking:', event.data.text);
  } else if (event.type === 'command_output') {
    console.log('📟 Output:', event.data.output);
  }
});

// Create a task via fetch
fetch('http://localhost:3001/api/tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: "analyze my desktop files",
    workingDir: "C:/Users/savbo/OneDrive/Desktop",
    approvalMode: "suggest"
  })
})
.then(r => r.json())
.then(data => console.log('Task created:', data.data.taskId));
```

### **3. You'll See Real-Time Events Like:**
```
🧠 AI Thinking: **Determining shell and command for Windows**
🔧 Executing: powershell.exe -NoLogo -NoProfile -Command Get-ChildItem
📟 Output: Directory: C:\Users\savbo\OneDrive\Desktop
📟 Output: Mode                 LastWriteTime         Length Name
✅ Desktop contains folders `Academic`, `Conductor`, `Development Projects`...
```

---

## 🎯 **Event Types Summary**

| Event Type | Description | Data Fields |
|------------|-------------|-------------|
| `thinking_step` | AI reasoning process | `text`, `type`, `timestamp` |
| `command_event` | Command start/end | `command`, `workdir`, `exitCode` |
| `command_output` | Live terminal output | `output`, `stream` |
| `token_update` | API usage tracking | `tokenInfo`, `rateLimits` |
| `agent_message` | Final AI response | `message` |

---

**Your frontend team can now build rich, real-time AI interfaces that show users exactly what Codex is thinking as it works!** 🧠✨

The streaming is live and ready for integration into any frontend framework! 🚀