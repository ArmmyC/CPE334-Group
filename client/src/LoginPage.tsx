import { useState, type FormEvent } from 'react';
import { loginRequestSchema } from '@cpe334-group/shared';
import { ApiRequestError, login } from './api';
import { useAuth } from './auth';
import { SystemStatus } from './SystemStatus';

type Field = 'email' | 'password';

function firstMessages(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    fields[String(issue.path[0])] ??= issue.message;
  }
  return fields;
}

export function LoginPage() {
  const { signIn } = useAuth();
  const [values, setValues] = useState<Record<Field, string>>({ email: '', password: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const parsed = loginRequestSchema.safeParse(values);
    if (!parsed.success) {
      setFields(firstMessages(parsed.error.issues));
      return;
    }
    setFields({});
    setSubmitting(true);
    try {
      signIn(await login(parsed.data));
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setFields(error.fields);
        if (error.code !== 'VALIDATION_ERROR') setMessage(error.message);
      } else {
        setMessage('Could not reach the server.');
      }
      setSubmitting(false);
    }
  }

  function input(field: Field, label: string, type: string, autoComplete: string) {
    const id = `login-${field}`;
    const error = fields[field];
    return (
      <div className="mb-3">
        <label htmlFor={id} className="form-label">
          {label}
        </label>
        <input
          id={id}
          type={type}
          className={error ? 'form-control is-invalid' : 'form-control'}
          value={values[field]}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => setValues({ ...values, [field]: event.target.value })}
        />
        {error && (
          <div id={`${id}-error`} className="invalid-feedback">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="mx-auto" style={{ maxWidth: '24rem' }}>
      <h1 className="h3 mb-3">Log in</h1>
      {message && (
        <div role="alert" className="alert alert-danger">
          {message}
        </div>
      )}
      <form noValidate onSubmit={handleSubmit}>
        {input('email', 'Email', 'email', 'username')}
        {input('password', 'Password', 'password', 'current-password')}
        <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>
      <div className="mt-4 small">
        <SystemStatus />
      </div>
    </section>
  );
}
