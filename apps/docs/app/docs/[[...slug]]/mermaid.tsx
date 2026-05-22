'use client';

import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// Initialize Mermaid globally on the client side
if (typeof window !== 'undefined') {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    themeVariables: {
      primaryColor: '#d9a752',
      primaryTextColor: '#ffffff',
      primaryBorderColor: '#d9a752',
      lineColor: '#d9a752',
      secondaryColor: '#1e1b18',
      tertiaryColor: '#0b0b0f',
    }
  });
}

export function Mermaid({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const renderId = `mermaid-${Math.random().toString(36).substring(2, 11)}`;

    const renderDiagram = async () => {
      try {
        const { svg: renderedSvg } = await mermaid.render(renderId, code);
        if (isMounted) {
          setSvg(renderedSvg);
          setError('');
        }
      } catch (err: any) {
        console.error('Mermaid render error:', err);
        // Clear any bad SVG element created by mermaid in document body
        const badEl = document.getElementById(renderId);
        if (badEl) badEl.remove();
        
        if (isMounted) {
          setError('Failed to render diagram');
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [code]);

  if (error) {
    return (
      <div className="my-6 p-4 rounded-md border border-red-500/20 bg-red-950/10 text-red-400 text-sm font-mono overflow-auto">
        {error}
        <pre className="mt-2 text-xs opacity-60 max-h-40 overflow-y-auto">{code}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-6 animate-pulse bg-neutral-900 border border-neutral-800 h-40 rounded-md flex flex-col items-center justify-center text-neutral-500 gap-2">
        <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-xs font-medium">Drawing cryptographic pipeline...</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className="my-8 flex justify-center w-full bg-neutral-950/40 border border-neutral-900/60 p-6 rounded-xl overflow-x-auto shadow-inner"
      dangerouslySetInnerHTML={{ __html: svg }} 
    />
  );
}
