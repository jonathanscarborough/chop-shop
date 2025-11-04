# Chop Shop - Real-Time Music Sampler

A mobile-optimized web app for real-time music sampling, recording, and sharing.

## Features

- **Record Page**: Touch-and-hold recording interface
- **Samples Page**: Dynamic grid of audio samples with playback
- **Share Page**: Export and share recordings to various platforms
- **Project Management**: Create and switch between multiple projects
- **PWA Support**: Install as a native app on mobile devices

## Tech Stack

- Next.js 15 with App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Web Audio API
- MediaRecorder API

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## How to Use

### Record Page
- Hold the "RECORD" button to capture audio
- Release to stop recording
- Press "STOP" to navigate to Samples page

### Samples Page
- Tap grid buttons to trigger samples
- Press "RECORD" button to create a master recording
- All triggered samples and incoming audio are captured

### Share Page
- Export recordings to device storage
- Share to SoundCloud
- Share to social media platforms

## Future Enhancements

- IndexedDB integration for persistent storage
- Inter-app audio routing
- Advanced audio effects
- Waveform visualization
- Polyphonic/Monophonic playback modes
- Sample editing features

## Browser Support

Works best on modern mobile browsers with Web Audio API support:
- Chrome/Edge (Android & iOS)
- Safari (iOS)
- Firefox (Android)

## License

MIT
