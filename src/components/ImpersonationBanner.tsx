import { Eye, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export function ImpersonationBanner() {
  const { isImpersonating, impersonatedSupplier, stopImpersonation } = useAuth();
  const navigate = useNavigate();

  if (!isImpersonating || !impersonatedSupplier) return null;

  const handleExit = () => {
    stopImpersonation();
    navigate('/admin/suppliers');
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 border-b border-warning/40 bg-warning/95 text-warning-foreground shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2 text-sm">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4" />
          <span>
            <strong>Viewing as supplier:</strong> {impersonatedSupplier.company || impersonatedSupplier.name}
            <span className="ml-2 rounded bg-background/30 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
              Read-only
            </span>
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="bg-background/95 text-foreground hover:bg-background"
          onClick={handleExit}
        >
          <LogOut className="mr-1 h-3.5 w-3.5" />
          Exit view as
        </Button>
      </div>
    </div>
  );
}
