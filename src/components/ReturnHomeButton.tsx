import { ArrowLeft } from 'lucide-react';

// Shows a return affordance only when Folia was opened from the personal homepage.
export default function ReturnHomeButton() {
    const fromHomepage = new URLSearchParams(window.location.search).get('from') === 'leleo-home';

    if (!fromHomepage) return null;

    return (
        <button
            type="button"
            onClick={() => window.history.back()}
            className="fixed right-4 top-4 z-[300] inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-4 py-2 text-sm text-white/85 shadow-lg backdrop-blur-md transition-colors hover:border-white/30 hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            aria-label="返回主页"
        >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>返回主页</span>
        </button>
    );
}
