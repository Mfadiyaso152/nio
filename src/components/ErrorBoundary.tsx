import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'حدث خطأ غير متوقع في التطبيق.',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let friendly = 'تعذر إتمام العملية بسبب صلاحيات الوصول أو خطأ تقني.';
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed?.error) {
          friendly = `تعذر الوصول للبيانات (${parsed.operationType || 'read'}): تأكد من الصلاحيات أو أعد المحاولة.`;
        }
      } catch {
        friendly = this.state.errorMessage;
      }

      return (
        <div
          dir="rtl"
          className="min-h-screen bg-[#F7F7F9] text-[#34343D] flex items-center justify-center p-6"
        >
          <div className="max-w-md w-full bg-white border border-[#E4E4EA] rounded-2xl p-8 text-center space-y-4">
            <h2 className="font-ruqaa text-2xl font-bold text-[#34343D]">
              حدث عارض تقني
            </h2>
            <p className="text-sm text-[#6B6B76] leading-relaxed">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-[#34343D] text-white text-sm font-bold rounded-xl hover:bg-[#26262E] transition-colors cursor-pointer"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
