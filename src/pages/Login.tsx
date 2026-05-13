import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Mail, Lock, Eye, EyeOff, Upload, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import embossLogo from '@/assets/emboss-logo.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';

type DocKey = 'gst' | 'pan' | 'tan' | 'msme' | 'bank' | 'other';

interface DocConfig {
  key: DocKey;
  label: string;
  required: boolean;
}

const DOCUMENTS: DocConfig[] = [
  { key: 'gst', label: 'GST Certificate', required: true },
  { key: 'pan', label: 'PAN Card of Company', required: true },
  { key: 'tan', label: 'TAN Certificate', required: true },
  { key: 'msme', label: 'MSME Certificate', required: false },
  { key: 'bank', label: 'Bank Details / Cancelled Cheque', required: true },
  { key: 'other', label: 'Any other supporting document', required: false },
];

const initialForm = {
  name: '',
  company: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  gstNumber: '',
  panNumber: '',
  tanNumber: '',
  msmeNumber: '',
  bankName: '',
  accountNumber: '',
  ifscCode: '',
  accountType: 'Savings',
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Registration state
  const [step, setStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState(initialForm);
  const [documents, setDocuments] = useState<Record<DocKey, File | null>>({
    gst: null, pan: null, tan: null, msme: null, bank: null, other: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationDone, setRegistrationDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await login(email, password);
      if (!error) {
        toast({ title: 'Welcome back!', description: 'Successfully logged in.' });
        navigate('/dashboard');
      } else {
        toast({ title: 'Login failed', description: error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Something went wrong.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (key: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const validateStep1 = (): string | null => {
    const required: (keyof typeof formData)[] = [
      'name', 'company', 'email', 'password', 'confirmPassword', 'phone',
      'gstNumber', 'panNumber', 'tanNumber', 'bankName', 'accountNumber', 'ifscCode',
    ];
    for (const k of required) {
      if (!formData[k]?.trim()) return `${k} is required`;
    }
    if (formData.password.length < 6) return 'Password must be at least 6 characters';
    if (formData.password !== formData.confirmPassword) return 'Passwords do not match';
    return null;
  };

  const handleNext = () => {
    const err = validateStep1();
    if (err) {
      toast({ title: 'Please complete all required fields', description: err, variant: 'destructive' });
      return;
    }
    setStep(2);
  };

  const handleFileChange = (key: DocKey, file: File | null) => {
    setDocuments((prev) => ({ ...prev, [key]: file }));
  };

  const handleRegister = async () => {
    // validate required docs
    const missingDoc = DOCUMENTS.find((d) => d.required && !documents[d.key]);
    if (missingDoc) {
      toast({ title: 'Missing document', description: `${missingDoc.label} is required`, variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const redirectUrl = `${window.location.origin}/`;
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: { name: formData.name, company: formData.company },
        },
      });
      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error('Sign up failed');

      const userId = signUpData.user.id;

      // Upload documents
      const uploadedPaths: string[] = [];
      for (const doc of DOCUMENTS) {
        const file = documents[doc.key];
        if (!file) continue;
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `registrations/${formData.email}/${doc.key}_${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('supplier-documents')
          .upload(path, file, { upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);
      }

      // Upsert supplier (the auth trigger may have already inserted a minimal row)
      const { error: supplierError } = await supabase
        .from('suppliers')
        .upsert(
          {
            user_id: userId,
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            company: formData.company,
            gst_number: formData.gstNumber,
            address: '',
            zoho_vendor_id: '',
            role: 'supplier',
          },
          { onConflict: 'user_id' }
        );
      if (supplierError) throw supplierError;

      // Insert registration
      const { error: regError } = await supabase.from('supplier_registrations').insert({
        user_id: userId,
        email: formData.email,
        company: formData.company,
        pan_number: formData.panNumber,
        tan_number: formData.tanNumber,
        msme_number: formData.msmeNumber || null,
        bank_name: formData.bankName,
        account_number: formData.accountNumber,
        ifsc_code: formData.ifscCode,
        account_type: formData.accountType,
        documents_uploaded: uploadedPaths,
        status: 'pending',
      });
      if (regError) throw regError;

      setRegistrationDone(true);
      toast({ title: 'Registration submitted!', description: 'We will review your documents shortly.' });
    } catch (err: any) {
      toast({ title: 'Registration failed', description: err.message || 'Something went wrong', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetToLogin = () => {
    setShowRegister(false);
    setStep(1);
    setFormData(initialForm);
    setDocuments({ gst: null, pan: null, tan: null, msme: null, bank: null, other: null });
    setRegistrationDone(false);
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Panel - Branding */}
      <div className="hidden w-1/2 bg-gradient-hero lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/95 p-2 shadow-lg backdrop-blur">
            <img src={embossLogo} alt="Emboss Marketing" className="h-full w-auto" />
          </div>
          <div className="text-white">
            <h1 className="text-xl font-bold">Emboss Marketing</h1>
            <p className="text-sm text-white/80">Logistics Portal</p>
          </div>
        </div>

        <div className="space-y-6 animate-fade-in">
          <h2 className="text-4xl font-bold leading-tight text-white">
            Streamline Your
            <br />
            <span className="text-accent">Supply Chain</span>
          </h2>
          <p className="max-w-md text-lg text-white/80">
            Manage purchase orders, invoices, and shipments all in one place.
            Experience seamless collaboration with Emboss Marketing.
          </p>
          <div className="flex gap-6">
            <div className="text-white">
              <p className="text-3xl font-bold">500+</p>
              <p className="text-sm text-white/70">Active Suppliers</p>
            </div>
            <div className="text-white">
              <p className="text-3xl font-bold">₹50Cr+</p>
              <p className="text-sm text-white/70">Monthly Transactions</p>
            </div>
            <div className="text-white">
              <p className="text-3xl font-bold">99.9%</p>
              <p className="text-sm text-white/70">Uptime</p>
            </div>
          </div>
        </div>

        <p className="text-sm text-white/50">
          © 2024 Emboss Marketing. All rights reserved.
        </p>
      </div>

      {/* Right Panel */}
      <div className="flex w-full items-center justify-center bg-background p-8 lg:w-1/2">
        <div className="w-full max-w-md space-y-6 animate-slide-up">
          <div className="text-center lg:text-left">
            <div className="mb-6 flex items-center justify-center gap-3 lg:hidden">
              <img src={embossLogo} alt="Emboss Marketing" className="h-12 w-auto" />
              <span className="text-xl font-bold">Emboss Marketing</span>
            </div>
          </div>

          {!showRegister && (
            <>
              <div className="text-center lg:text-left">
                <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
                <p className="mt-2 text-muted-foreground">Sign in to access your supplier dashboard</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="supplier@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <a href="#" className="text-sm text-primary hover:underline">
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" variant="gradient" size="lg" disabled={isLoading}>
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={async () => {
                    const result = await lovable.auth.signInWithOAuth('google', {
                      redirect_uri: window.location.origin,
                    });
                    if (result.error) {
                      toast({ title: 'Google sign-in failed', description: result.error.message, variant: 'destructive' });
                    }
                  }}
                >
                  <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </Button>

                <div className="text-center text-sm text-muted-foreground">
                  New supplier?{' '}
                  <button
                    type="button"
                    onClick={() => setShowRegister(true)}
                    className="font-medium text-primary hover:underline"
                  >
                    Register here
                  </button>
                </div>
              </form>
            </>
          )}

          {showRegister && registrationDone && (
            <div className="space-y-6 rounded-xl border bg-card p-8 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-10 w-10 text-success" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Registration Submitted!</h2>
                <p className="text-muted-foreground">
                  Our team at <span className="font-medium text-foreground">accounts@embossmarketing.in</span> will
                  review your documents and activate your account within 2 business days.
                </p>
              </div>
              <Button onClick={resetToLogin} variant="gradient" size="lg" className="w-full">
                Back to Login
              </Button>
            </div>
          )}

          {showRegister && !registrationDone && (
            <div className="space-y-6">
              <button
                type="button"
                onClick={resetToLogin}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Login
              </button>

              <div>
                <h2 className="text-2xl font-bold text-foreground">Supplier Registration</h2>
                <p className="mt-2 text-muted-foreground">
                  Step {step} of 2 — {step === 1 ? 'Company Details' : 'Document Upload'}
                </p>
              </div>

              {step === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Full Name *</Label>
                      <Input value={formData.name} onChange={(e) => updateField('name', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Company Name *</Label>
                      <Input value={formData.company} onChange={(e) => updateField('company', e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input type="email" value={formData.email} onChange={(e) => updateField('email', e.target.value)} />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Password *</Label>
                      <Input
                        type="password"
                        value={formData.password}
                        onChange={(e) => updateField('password', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Confirm Password *</Label>
                      <Input
                        type="password"
                        value={formData.confirmPassword}
                        onChange={(e) => updateField('confirmPassword', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Phone Number *</Label>
                    <Input value={formData.phone} onChange={(e) => updateField('phone', e.target.value)} />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>GST Number *</Label>
                      <Input value={formData.gstNumber} onChange={(e) => updateField('gstNumber', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>PAN Number *</Label>
                      <Input value={formData.panNumber} onChange={(e) => updateField('panNumber', e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>TAN Number *</Label>
                      <Input value={formData.tanNumber} onChange={(e) => updateField('tanNumber', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>MSME Certificate Number</Label>
                      <Input value={formData.msmeNumber} onChange={(e) => updateField('msmeNumber', e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Bank Name *</Label>
                    <Input value={formData.bankName} onChange={(e) => updateField('bankName', e.target.value)} />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Account Number *</Label>
                      <Input
                        value={formData.accountNumber}
                        onChange={(e) => updateField('accountNumber', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>IFSC Code *</Label>
                      <Input value={formData.ifscCode} onChange={(e) => updateField('ifscCode', e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Account Type *</Label>
                    <Select
                      value={formData.accountType}
                      onValueChange={(v) => updateField('accountType', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Savings">Savings</SelectItem>
                        <SelectItem value="Current">Current</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button onClick={handleNext} variant="gradient" size="lg" className="w-full">
                    Next: Upload Documents
                  </Button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  {DOCUMENTS.map((doc) => {
                    const file = documents[doc.key];
                    return (
                      <div key={doc.key} className="rounded-lg border bg-card p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <Label className="text-sm font-medium">
                            {doc.label}{' '}
                            {doc.required ? (
                              <span className="text-destructive">* Required</span>
                            ) : (
                              <span className="text-muted-foreground">(Optional)</span>
                            )}
                          </Label>
                          {file && <CheckCircle2 className="h-5 w-5 text-success" />}
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
                            <Upload className="h-4 w-4" />
                            <span>{file ? 'Change file' : 'Choose file'}</span>
                            <input
                              type="file"
                              accept="application/pdf,image/*"
                              className="hidden"
                              onChange={(e) => handleFileChange(doc.key, e.target.files?.[0] || null)}
                            />
                          </label>
                          {file && (
                            <span className="truncate text-sm text-muted-foreground">{file.name}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex gap-3 pt-2">
                    <Button
                      onClick={() => setStep(1)}
                      variant="outline"
                      size="lg"
                      className="flex-1"
                      disabled={isSubmitting}
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleRegister}
                      variant="gradient"
                      size="lg"
                      className="flex-1"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        'Submit Registration'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
