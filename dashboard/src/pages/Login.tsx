import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { login } from '../lib/auth';
import { Card } from '../components/ui';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    // Keep the synchronous login flow but reflect a "submitting" state briefly.
    const ok = login(username, password);
    if (ok) {
      navigate('/');
    } else {
      setError('Invalid username or password');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-up">
        <Card className="p-8">
          {/* Logo */}
          <div className="mb-6 flex justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-400/15 text-xl font-bold text-primary-300 ring-1 ring-primary-400/25">
              L
            </span>
          </div>

          {/* Title */}
          <div className="mb-8 text-center">
            <h1 className="page-title">Welcome back</h1>
            <p className="mt-1.5 text-sm text-ink-subtle">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="mb-1.5 block text-xs font-medium text-ink-muted">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="Enter your username"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-ink-muted">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="Enter your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full"
            >
              {isSubmitting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#06171A]/30 border-t-[#06171A]" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 border-t border-line pt-5 text-center">
            <p className="text-xs text-ink-faint">
              Default credentials:{' '}
              <span className="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-ink-subtle">
                admin / admin
              </span>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
