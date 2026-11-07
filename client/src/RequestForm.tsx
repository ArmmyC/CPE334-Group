import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { createRequestSchema } from '@cpe334-group/shared';
import { ApiRequestError, submitRequest } from './api';

function firstMessages(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    fields[String(issue.path[0])] ??= issue.message;
  }
  return fields;
}

// The borrow request form (F-03). F-02's equipment detail page places it, so it is exported
// and not yet on a route. It checks the shared schema before it sends anything, then shows
// the API's field messages next to the fields and its rule message above the form.
export function RequestForm({ equipmentTypeId }: { equipmentTypeId: number }) {
  const [purpose, setPurpose] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSubmitted(false);
    const parsed = createRequestSchema.safeParse({
      equipmentTypeId,
      purpose: purpose === '' ? undefined : purpose,
    });
    if (!parsed.success) {
      setFields(firstMessages(parsed.error.issues));
      return;
    }
    setFields({});
    setSubmitting(true);
    try {
      await submitRequest(parsed.data);
      setSubmitted(true);
      setPurpose('');
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setFields(error.fields);
        if (error.code !== 'VALIDATION_ERROR') setMessage(error.message);
      } else {
        setMessage('Could not reach the server.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const purposeError = fields.purpose;

  return (
    <form noValidate onSubmit={handleSubmit} className="mt-3">
      {message && (
        <div role="alert" className="alert alert-danger">
          {message}
        </div>
      )}
      {submitted && (
        <div role="status" className="alert alert-success">
          Request submitted. It stays Pending until a custodian checks it out.{' '}
          <Link to="/my">View My requests</Link>
        </div>
      )}
      <div className="mb-3">
        <label htmlFor="request-purpose" className="form-label">
          Purpose (optional)
        </label>
        <textarea
          id="request-purpose"
          rows={3}
          className={purposeError ? 'form-control is-invalid' : 'form-control'}
          value={purpose}
          aria-invalid={purposeError ? true : undefined}
          aria-describedby={purposeError ? 'request-purpose-error' : undefined}
          onChange={(event) => setPurpose(event.target.value)}
        />
        {purposeError && (
          <div id="request-purpose-error" className="invalid-feedback">
            {purposeError}
          </div>
        )}
      </div>
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Submitting...' : 'Submit request'}
      </button>
    </form>
  );
}
