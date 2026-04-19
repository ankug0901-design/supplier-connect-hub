import { AlertCircle } from 'lucide-react';

export function AccountSetupBanner() {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-warning" />
        <div>
          <h4 className="font-medium text-foreground">Account setup pending</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account is not yet linked to our accounting system. Please contact{' '}
            <a href="mailto:accounts@embossmarketing.in" className="font-medium text-primary hover:underline">
              accounts@embossmarketing.in
            </a>{' '}
            to complete setup.
          </p>
        </div>
      </div>
    </div>
  );
}
