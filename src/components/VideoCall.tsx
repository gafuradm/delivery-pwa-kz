import React, { useEffect, useRef } from 'react';

interface VideoCallProps {
  roomName: string;
  userName: string;
  onClose: () => void;
}

export default function VideoCall({ roomName, userName, onClose }: VideoCallProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://meet.jit.si/external_api.js';
    script.async = true;
    script.onload = () => {
      if (containerRef.current && (window as any).JitsiMeetExternalAPI) {
        const domain = 'meet.jit.si';
        const options = {
          roomName: roomName,
          width: '100%',
          height: '100%',
          parentNode: containerRef.current,
          userInfo: {
            displayName: userName,
          },
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_BRAND_WATERMARK: false,
          },
        };
        new (window as any).JitsiMeetExternalAPI(domain, options);
      }
    };
    document.head.appendChild(script);
    return () => {
      const scriptElem = document.querySelector('script[src="https://meet.jit.si/external_api.js"]');
      if (scriptElem) scriptElem.remove();
    };
  }, [roomName, userName]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, background: 'white' }}>
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 2001 }}>
        <button onClick={onClose} style={{ padding: '8px 16px', background: '#f44336', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Закрыть</button>
      </div>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}