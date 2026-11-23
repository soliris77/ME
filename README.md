README

<div align="center">

Soliris

A local AI assistant with a HUD interface — JARVIS-style, Python core, running entirely on your own machine.


Status Version Platform Python Offline License


Français · English


</div>


Overview

Soliris is a personal assistant that runs locally. It opens a head-up-display interface — animated rings, a conversation log, live status indicators — and answers written or spoken commands: questions, launching applications, time, calculations, notes, system information.


The design principle is simple: the logic lives in a Python core, and the UI only displays what the core sends it. No remote server, no account, no mandatory internet connection. Everything is processed on the machine it runs on.


<p align="center"> <img src="assets/capture-hud.png" alt="Soliris HUD interface" width="720"> </p>

The Soliris HUD: status ring, command transcript, and response stream.<img width="1214" height="656" alt="image" src="https://github.com/user-attachments/assets/d59e3ab9-8221-4ac2-aac5-6ee780b038b1" />




Features

Local conversation — ask/answer loop driven by a model running on your own hardware (via Ollama or any OpenAI-compatible local backend).
Voice commands (optional) — speech recognition and text-to-speech when the audio extras are installed.
HUD interface — core status, microphone level, conversation history, clock and system load.
System actions — open an application, check the time, disk space, battery level.
Logging — every exchange and error is written to logs/, so you can see exactly what happened.
Fully offline — no outbound requests beyond the optional local model.


Requirements

Tool	Version	Why
Python	3.10+	Runs the core
pip	bundled with Python	Installs dependencies
Ollama (optional)	latest	Provides the local language model



Without Ollama (or another local backend) Soliris still starts: the interface runs, but model responses stay unavailable.



Installation


Shell
Copy
# 1. Get the project
git clone https://github.com/<your-username>/soliris.git
cd soliris

# 2. Create a virtual environment
python -m venv .venv

# 3. Activate it
# Windows:
.venv\Scripts\activate
# Linux / macOS:
source .venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Prepare the configuration
copy config\config.example.yaml config\config.yaml   # Windows
cp config/config.example.yaml config/config.yaml     # Linux / macOS


Running Soliris

From the project root, with the virtual environment activated:



Shell
Copy
python main.py

On Windows, double-clicking run.bat does the same thing (it activates the environment and starts the core). On Linux/macOS use ./run.sh.


If the local model isn't downloaded yet:



Shell
Copy
ollama pull llama3        # or whichever model is set in config.yaml

To stop: close the HUD window, or press Ctrl+C in the terminal.



Configuration

Everything is set in config/config.yaml, created from config.example.yaml:


Key	Purpose	Default
model.name	Local model to use	llama3
model.endpoint	Local backend address	http://localhost:11434
voice.enabled	Enable listening and speech output	false
ui.theme	Visual theme of the HUD	hud_blue
log.level	Log verbosity	INFO



Never hard-code keys or secrets. The config file stays local and is not committed to the repository.



Usage

Start Soliris (python main.py). The HUD opens and the ring turns green once the core is ready.
Type a command in the bottom field, or press the listen key to speak.
The answer appears in the central log; the session history stays visible on the right.
Esc closes the HUD cleanly; the session is saved to logs/.

Example: "Soliris, what time is it?" → the time is displayed in the HUD and spoken aloud if voice is enabled.



Project structure


Auto (Plain text)
Copy
soliris/
├── main.py                  entry point: starts the core and opens the HUD
├── requirements.txt         Python dependencies
├── run.bat / run.sh         launchers (activate venv + start)
├── config/
│   ├── config.example.yaml  configuration template
│   └── config.yaml          your real configuration (git-ignored)
├── core/                    the core: Soliris logic, independent of the display
│   ├── assistant.py         main loop, sends requests to the model
│   ├── commands.py          system commands (time, applications, disk…)
│   ├── memory.py            conversation context
│   ├── voice.py             microphone input and speech output
│   └── llm.py               connection to the local model (Ollama / compatible API)
├── ui/                      the HUD interface
│   ├── window.py            main window and render loop
│   ├── widgets.py           rings, gauges, conversation log
│   └── theme.py             colors, fonts, animations
├── assets/                  fonts, icons, sounds, screenshots
├── logs/                    runtime logs (created automatically)
└── docs/                    design notes, diagrams

Separation rule: core/ knows nothing about ui/. The core emits events, the interface displays them. That is what makes the logic testable without opening a window — and the look replaceable without touching the brain.



Troubleshooting

Problem	Fix
ModuleNotFoundError on startup	The virtual environment isn't activated, or pip install -r requirements.txt was not run
HUD opens but no answers arrive	The local backend isn't running: check ollama serve and model.endpoint in config.yaml
No reaction to the microphone	voice.enabled is false, or the audio extra isn't installed; check the default input device
Interface feels slow	The model is too large for the machine — try a smaller variant
The HUD won't close	Ctrl+C in the terminal, then relaunch; errors are in logs/




Roadmap

Python core and conversation loop
HUD interface and conversation log
Basic system commands
Long-term memory across sessions
Plugins (calendar, music, home automation)
Alternative HUD themes


Contributing

This is a personal project, but issues and suggestions are welcome. Open an issue describing the idea before sending a pull request.


Author

Personal project — <your name>.

## Where Soliris stands — and where it's going

*Seven months, billions of tokens, and 60% of the way there.*

Soliris has been in development for seven months. Not a weekend project — seven months of evenings spent redrawing the HUD, rewriting the core, watching a ring spin and asking myself whether the thing behind it was actually thinking.

Billions of tokens later, here is the honest number: **Soliris is about 60% complete.**

What exists today is real. The HUD on this page is the actual interface, running locally: the core status, the activity feed, the orchestration panel, the intention bar at the bottom. The Python core, the command layer and the conversation loop work. But look closely at the panels, and you'll see what makes this project what it is — *à vérifier*, *non connecté*, *aucun statut simulé*, *pas d'état inventé*. The interface is built to refuse to invent a status. If a service isn't connected, it says so. That rule has cost me more time than any animation, and it is the reason I trust what the screen shows me.

The remaining 40% is the hardest and the most interesting part:

- the **orchestrator core** — the layer that will take a goal in plain language, split it into steps, and dispatch them to the right module;
- **long-term memory**, so the system keeps context across days instead of one session;
- **real service connections**, to replace the preview panels with live data;
- the long, unglamorous work of making all of it stable enough to leave running.

Finishing Soliris is my dream. Not because the world needs another assistant, but because this one is mine: it runs on my machine, it answers to my rules, and every line of it exists because I wanted to understand how far a single person can push a system built alone. There is no release date and no funding — just a screen that says *Le système est en veille*, and the stubborn intention to see it wake up fully.

If you're reading this and you're building something similar: the 60% is the part nobody sees. Keep going.
License

Personal project, all rights reserved. If you plan to accept contributions or allow reuse, switch to a standard license such as MIT by adding a LICENSE file and updating the badge above.
<img width="1009" height="641" alt="image" src="https://github.com/user-attachments/assets/82a22b12-a097-45aa-be4a-e8e26e2bb153" />

Add a block (type / for options)
