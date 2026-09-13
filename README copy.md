# Neo Mesh AI

**Offline-first emergency communication powered by mesh networking and
AI-assisted triage.**

Neo Mesh AI is an emergency communication platform designed to help
people stay connected when traditional internet and cellular networks
are unavailable or unreliable. The system combines peer-to-peer mesh
networking, secure messaging, location-aware emergency tools,
AI-assisted urgency analysis, and a responder dashboard to support
communication during disasters and other high-risk situations.

The project includes a React Native mobile application, a web-based
emergency management dashboard, and a Node.js/Express backend.

## The Problem

During hurricanes, floods, wildfires, power outages, and other
emergencies, cellular towers and internet infrastructure can become
overloaded or completely unavailable. At the same time, communication
becomes more important than ever.

Neo Mesh AI was built around a simple question:

> How can people send critical information and reach nearby help even
> when normal communication infrastructure fails?

Instead of depending entirely on an internet connection, Neo is designed
around an offline-first architecture where nearby devices can discover
one another, relay messages, and store information until connectivity
becomes available again.

## Key Features

### Offline-First Mesh Communication

Neo uses nearby-device communication concepts including Bluetooth Low
Energy (BLE) and Wi-Fi P2P to support peer discovery and message relay.
Messages can be queued locally, forwarded through nearby devices,
retried automatically, and synchronized when connectivity returns.

### AI-Assisted Emergency Triage

Emergency requests can be analyzed to identify urgency and help
prioritize critical situations. The backend integrates Google Gemini for
AI-assisted emergency analysis and includes keyword-based triage as a
fallback when AI services are unavailable.

### Intelligent Message Routing

The routing layer evaluates available peers and delivery information to
help select routes for messages across the mesh. Delivery outcomes can
be logged so the system can make better routing decisions.

### Secure Messaging

The mobile architecture includes encryption, signing, and identity
management for protecting messages transmitted between devices. The
security layer uses AES-256 encryption and HMAC-SHA256 signing.

### Responder Dashboard

The web dashboard gives responders and emergency coordinators a
centralized interface for viewing and managing emergency information.
Features include:

-   Emergency and help requests
-   Rescue logs
-   Nearby devices
-   Location updates
-   Disaster management tools
-   Relief feed
-   Shelter discovery
-   First-aid guidance
-   Demo victim and responder views

### Location-Aware Emergency Support

Neo includes geolocation and map-based functionality for location
updates, geo-fenced emergency broadcasts, route information, and nearby
emergency resources.

### First Aid Support

The platform includes first-aid resources and backend endpoints designed
to provide useful emergency guidance when professional help may not be
immediately available.

## System Architecture

Neo Mesh AI is organized into three main applications:

``` text
neo-main/
│
├── app/                  # React Native mobile application
├── neo-dashboard/        # React + Vite responder dashboard
├── server/               # Node.js / Express backend
├── docs/                 # Architecture and API documentation
├── scripts/              # Local development helper scripts
├── render.yaml           # Render deployment configuration
└── package.json          # Root workspace configuration
```

The mobile application follows a layered architecture:

``` text
Presentation Layer
        ↓
Business Logic / Services
        ↓
AI + Security Layers
        ↓
Mesh Networking Layer
        ↓
Local Storage / Sync
        ↓
Backend & Cloud Services
```

A typical message flow is:

``` text
User creates emergency message
            ↓
Message is encrypted and signed
            ↓
Urgency / priority is classified
            ↓
Available peers are discovered
            ↓
Routing logic selects a path
            ↓
Message is relayed through the mesh
            ↓
Delivery result is recorded
            ↓
Data synchronizes when connectivity returns
```

## Tech Stack

  Area              Technologies
  ----------------- ---------------------------------------------
  Mobile            React Native, React Navigation
  Web Dashboard     React, Vite, React Router
  Backend           Node.js, Express
  AI                Google Gemini
  Mesh Networking   Bluetooth Low Energy, Wi-Fi P2P
  Maps & Location   React Native Maps, Leaflet, Google Maps API
  Local Storage     SQLite, AsyncStorage
  Security          AES-256, HMAC-SHA256, CryptoJS
  Data / Cloud      Firebase
  Data Fetching     Axios, TanStack React Query
  Visualization     Recharts
  Testing           Node.js Test Runner, Jest
  Deployment        Render

## Core Components

### Mobile Application

The mobile app contains the core offline mesh functionality.

Important services include:

-   `MeshManager` --- coordinates mesh networking operations
-   `NodeDiscovery` --- discovers nearby devices
-   `MessageRelay` --- creates and relays messages between peers
-   `GeoBroadcast` --- supports location-based emergency broadcasts
-   `SyncManager` --- synchronizes queued data when connectivity returns
-   `AlertManager` --- manages emergency alerts
-   `RouterAI` --- assists with route selection
-   `PriorityClassifier` --- determines message urgency
-   `Encryptor` --- handles message encryption
-   `IdentityManager` --- manages device identity
-   `PeerCache` --- stores peer information locally
-   `RescueLogger` / `RescueSync` --- records and synchronizes rescue
    activity

### Backend

The Express backend supports emergency requests, peers, rescue
information, first aid, messages, location updates, weather, AI
analysis, routing, logs, and synchronization.

The local backend runs on:

``` text
http://localhost:4000
```

Health check:

``` http
GET /health
```

Additional API documentation is available in
[`docs/api-endpoints.md`](docs/api-endpoints.md).

### Responder Dashboard

The dashboard is a React/Vite application for monitoring and interacting
with emergency data. It includes views for disaster management, rescue
logs, first aid, shelters, location updates, nearby devices, and
demonstration scenarios.

## Getting Started

### Prerequisites

Before running Neo locally, install:

-   Node.js 18 or later
-   npm 9 or later
-   Git
-   React Native development requirements if running the native mobile
    application

API keys are required for some cloud and AI features.

### 1. Clone the Repository

``` bash
git clone <your-repository-url>
cd neo-main
```

### 2. Install Dependencies

Because the project contains separate applications, install dependencies
for each workspace:

``` bash
npm install

cd server
npm install

cd ../neo-dashboard
npm install

cd ../app
npm install
```

### 3. Configure Environment Variables

Copy the provided environment examples and add your own credentials.

For the backend:

``` bash
cd server
cp env.example .env
```

On Windows PowerShell:

``` powershell
Copy-Item env.example .env
```

Configure values such as:

``` env
PORT=4000
FRONTEND_URL=http://localhost:5173
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_MAPS_KEY=your_google_maps_api_key
```

Do **not** commit real API keys or secrets to GitHub.

### 4. Start the Backend

From the project root:

``` bash
npm run start:server
```

Or:

``` bash
cd server
npm start
```

The server runs on port `4000` by default.

### 5. Start the Dashboard

Open another terminal:

``` bash
cd neo-dashboard
npm run dev
```

Vite will display the local dashboard URL in the terminal.

### 6. Run the Mobile App

From the `app` directory:

``` bash
npm start
```

For Android:

``` bash
npm run android
```

For iOS:

``` bash
npm run ios
```

A web build is also available:

``` bash
npm run web
```

## Testing

Backend tests can be run from the root directory with:

``` bash
npm test
```

Or directly:

``` bash
cd server
npm test
```

The backend test suite covers areas including emergency analysis,
emergency schemas, Gemini integration, keyword triage, demo transport,
and controller behavior.

## Example API Request

Create a message:

``` http
POST /messages
Content-Type: application/json
```

``` json
{
  "senderId": "device-123",
  "receiverId": "device-456",
  "content": "I need emergency assistance.",
  "priority": "high"
}
```

Retrieve known peers:

``` http
GET /peers
```

## Offline Strategy

Neo is designed to remain useful when network conditions are poor. Its
offline strategy includes:

1.  Local message storage
2.  Nearby peer discovery
3.  Store-and-forward message relay
4.  Automatic retry behavior
5.  Local rescue and peer caching
6.  Synchronization when internet connectivity becomes available again

This architecture allows the system to reduce its dependence on
centralized infrastructure during an emergency.

## Security

Emergency communication can contain sensitive information, so the
architecture includes:

-   AES-256 encryption
-   HMAC-SHA256 message signing
-   Device identity management
-   Local-first data handling
-   Environment variables for API secrets

Production deployments should include additional security review,
authentication, authorization, secure key management, rate limiting, and
infrastructure hardening.

## Project Goals

Neo Mesh AI aims to demonstrate how modern mobile networking and
artificial intelligence can be combined to make emergency communication
more resilient. The project focuses on four major goals:

1.  **Resilience** --- communication should not completely disappear
    when internet access does.
2.  **Speed** --- urgent requests should be identified and surfaced
    quickly.
3.  **Reach** --- nearby devices should help extend communication beyond
    a single connection.
4.  **Accessibility** --- emergency tools should be straightforward
    enough to use under stressful conditions.

## Current Status

Neo Mesh AI is an active prototype. Several components model or
demonstrate capabilities that would require additional native-device
testing, infrastructure validation, security review, and field testing
before use in real-world emergency response.

**Neo should not currently be treated as a replacement for 911, official
emergency services, or certified medical guidance.**

## Documentation

More technical information is available in:

-   [`docs/mesh-architecture.md`](docs/mesh-architecture.md) --- system
    and mesh architecture
-   [`docs/api-endpoints.md`](docs/api-endpoints.md) --- backend API
    documentation
-   [`DEPLOYMENT.md`](DEPLOYMENT.md) --- deployment instructions
-   [`PRE_DEPLOYMENT_CHECKLIST.md`](PRE_DEPLOYMENT_CHECKLIST.md) ---
    deployment checklist

## Future Improvements

Potential next steps include expanded real-device mesh testing, stronger
multi-hop routing, responder authentication, push and local emergency
notifications, improved offline maps, expanded accessibility support,
larger-scale network simulations, end-to-end security audits, and field
testing under realistic disaster conditions.

## Why Neo?

Most communication applications assume that the network already exists.

Neo explores what happens when it does not.

By combining offline-first design, nearby-device networking, secure
message relay, location awareness, and AI-assisted emergency triage, Neo
Mesh AI is an attempt to make communication more resilient at the
moments when people need it most.

## License

This project is licensed under the MIT License.

------------------------------------------------------------------------

**Built by the Neo Team.**
