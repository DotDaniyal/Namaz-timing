import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected rendering error',
    };
  }

  private handleRecover = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // ignore cache cleanup failures
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-dvh islamic-emerald-bg text-[#F7F5EE] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-[#093224] border border-[#D4AF56]/50 p-6 text-center space-y-4 shadow-xl">
          <div className="font-calligraphy text-2xl text-[#D4AF56]" dir="rtl">
            مسجدِ بلال
          </div>
          <h1 className="font-masjid text-xl font-bold tracking-[0.12em] text-[#F7F5EE]">
            MASJID-E-BILAL
          </h1>
          <p className="text-sm text-[#D7E6DF] leading-relaxed">
            A display issue occurred while loading the prayer timetable. Reload to refresh the
            latest application files.
          </p>
          <button
            type="button"
            onClick={this.handleRecover}
            className="min-h-[44px] px-5 rounded-xl bg-[#D4AF56] text-[#07271C] text-sm font-semibold hover:bg-[#E2C16B] transition-colors cursor-pointer"
          >
            Reload Timetable
          </button>
        </div>
      </div>
    );
  }
}
