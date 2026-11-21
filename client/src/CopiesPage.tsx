import { useState, type FormEvent } from 'react';
import {
  COPY_STATUS_LABEL,
  createCopyBodySchema,
  type ChangeableCopyStatus,
  type CustodianCopy,
} from '@cpe334-group/shared';
import {
  ApiRequestError,
  changeCopyStatus,
  createCopy,
  fetchCustodianCopies,
  fetchCustodianEquipmentTypes,
} from './api';
import { useAuth } from './auth';
import { errorMessage, useLoad } from './useLoad';

type Confirming = { copyId: number; target: ChangeableCopyStatus };

// The changes a custodian can make from each status (F-06 switch, F-13 retire). On loan and
// Retired have none.
const ACTIONS: Partial<Record<CustodianCopy['status'], ChangeableCopyStatus[]>> = {
  AVAILABLE: ['IN_MAINTENANCE', 'RETIRED'],
  IN_MAINTENANCE: ['AVAILABLE', 'RETIRED'],
};

const actionLabel = (target: ChangeableCopyStatus) =>
  target === 'RETIRED' ? 'Retire' : `Set ${COPY_STATUS_LABEL[target]}`;

type AddErrors = { equipmentTypeId?: string; assetTag?: string };

// F-13: the form to add a copy. It loads the custodian's equipment types when it opens.
function AddCopyForm({
  onAdded,
  onClose,
}: {
  onAdded: (copy: CustodianCopy) => void;
  onClose: () => void;
}) {
  const { recheck } = useAuth();
  const { state: load, reload } = useLoad(
    fetchCustodianEquipmentTypes,
    'custodian-equipment-types',
  );
  const [typeId, setTypeId] = useState('');
  const [assetTag, setAssetTag] = useState('');
  const [errors, setErrors] = useState<AddErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const parsed = createCopyBodySchema.safeParse({
      equipmentTypeId: typeId === '' ? undefined : Number(typeId),
      assetTag,
    });
    if (!parsed.success) {
      const found: AddErrors = {};
      for (const issue of parsed.error.issues) {
        found[String(issue.path[0]) as keyof AddErrors] ??= issue.message;
      }
      setErrors(found);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      onAdded(await createCopy(parsed.data));
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        recheck();
      } else if (error instanceof ApiRequestError && Object.keys(error.fields).length > 0) {
        setErrors(error.fields);
      } else {
        setMessage(
          error instanceof ApiRequestError ? error.message : 'Could not reach the server.',
        );
      }
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void save(event)}
      noValidate
      className="mb-4"
      style={{ maxWidth: '32rem' }}
    >
      <h2 className="h5">Add copy</h2>
      {load.status === 'loading' && <p className="text-body-secondary">Loading...</p>}
      {load.status === 'error' && (
        <div className="alert alert-warning d-flex align-items-center gap-3">
          <span>{errorMessage(load.error, 'Could not load equipment types.')}</span>
          <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => reload()}>
            Retry
          </button>
        </div>
      )}
      {message && (
        <div role="alert" className="alert alert-danger">
          {message}
        </div>
      )}
      {load.status === 'ready' && (
        <>
          <div className="mb-3">
            <label htmlFor="add-copy-type" className="form-label">
              Equipment type
            </label>
            <select
              id="add-copy-type"
              className={`form-select${errors.equipmentTypeId ? ' is-invalid' : ''}`}
              value={typeId}
              disabled={saving}
              aria-invalid={Boolean(errors.equipmentTypeId)}
              onChange={(event) => setTypeId(event.target.value)}
            >
              <option value="">Choose an equipment type</option>
              {load.data.items.map((type) => (
                <option key={type.id} value={type.id}>
                  {`${type.name} (${type.lab.name})`}
                </option>
              ))}
            </select>
            {errors.equipmentTypeId && (
              <div className="invalid-feedback d-block">{errors.equipmentTypeId}</div>
            )}
          </div>
          <div className="mb-3">
            <label htmlFor="add-copy-tag" className="form-label">
              Asset tag
            </label>
            <input
              id="add-copy-tag"
              type="text"
              className={`form-control${errors.assetTag ? ' is-invalid' : ''}`}
              value={assetTag}
              disabled={saving}
              aria-invalid={Boolean(errors.assetTag)}
              onChange={(event) => setAssetTag(event.target.value)}
            />
            {errors.assetTag && <div className="invalid-feedback d-block">{errors.assetTag}</div>}
          </div>
          <div className="d-flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save copy'}
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={saving}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </>
      )}
    </form>
  );
}

// F-06: the copies in the custodian's labs, with a confirmed switch between Available and
// In maintenance. The API decides what is allowed, and the UI only shows its answer.
export function CopiesPage() {
  const { recheck } = useAuth();
  const { state: load, reload, refresh } = useLoad(fetchCustodianCopies, 'custodian-copies');
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<{ copyId: number; message: string } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function clearMessages() {
    setFieldError(null);
    setRefusal(null);
    setSuccess(null);
  }

  async function confirm(copy: CustodianCopy, target: ChangeableCopyStatus) {
    setSaving(true);
    clearMessages();
    try {
      await changeCopyStatus(copy.id, target);
      setConfirming(null);
      setSuccess(`${copy.assetTag} is now ${COPY_STATUS_LABEL[target]}.`);
      refresh();
    } catch (error) {
      // A 401 means the session ended, so the auth context checks it again (SDS 4.2).
      if (error instanceof ApiRequestError && error.status === 401) {
        recheck();
        return;
      }
      if (error instanceof ApiRequestError && error.fields.status) {
        setFieldError({ copyId: copy.id, message: error.fields.status });
      } else {
        setConfirming(null);
        setRefusal(
          error instanceof ApiRequestError ? error.message : 'Could not reach the server.',
        );
        // A refusal usually means the copy changed since the list loaded.
        if (error instanceof ApiRequestError && error.status === 409) refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h1 className="h3">Copies</h1>
      <div className="mb-3">
        {!adding && (
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={() => {
              clearMessages();
              setAdding(true);
            }}
          >
            Add copy
          </button>
        )}
        {adding && (
          <AddCopyForm
            onClose={() => setAdding(false)}
            onAdded={(added) => {
              setAdding(false);
              setSuccess(`Added ${added.assetTag}.`);
              refresh();
            }}
          />
        )}
      </div>
      {refusal && (
        <div className="alert alert-danger" role="alert">
          {refusal}
        </div>
      )}
      {success && (
        <div className="alert alert-success" role="status">
          {success}
        </div>
      )}
      {load.status === 'loading' && <p className="text-body-secondary">Loading...</p>}
      {load.status === 'error' && (
        <div className="alert alert-warning d-flex align-items-center gap-3">
          <span>{errorMessage(load.error, 'Could not load copies.')}</span>
          <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => reload()}>
            Retry
          </button>
        </div>
      )}
      {load.status === 'ready' && load.data.length === 0 && (
        <p className="text-body-secondary">No copies in your labs.</p>
      )}
      {load.status === 'ready' && load.data.length > 0 && (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th scope="col">Lab</th>
                <th scope="col">Equipment</th>
                <th scope="col">Asset tag</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {load.data.map((copy) => {
                const targets = ACTIONS[copy.status];
                const asking = confirming?.copyId === copy.id ? confirming : null;
                const errorId = `copy-${copy.id}-error`;
                const hasError = fieldError?.copyId === copy.id;
                return (
                  <tr key={copy.id}>
                    <td>{copy.lab.name}</td>
                    <td>{copy.equipmentType.name}</td>
                    <td>{copy.assetTag}</td>
                    <td>{COPY_STATUS_LABEL[copy.status]}</td>
                    <td>
                      {!targets && <span className="text-body-secondary">Cannot change</span>}
                      {targets && !asking && (
                        <div className="d-flex flex-wrap gap-2">
                          {targets.map((target) => (
                            <button
                              key={target}
                              type="button"
                              className={`btn btn-sm ${target === 'RETIRED' ? 'btn-outline-danger' : 'btn-outline-primary'}`}
                              onClick={() => {
                                clearMessages();
                                setConfirming({ copyId: copy.id, target });
                              }}
                            >
                              {actionLabel(target)}
                            </button>
                          ))}
                        </div>
                      )}
                      {asking && (
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          <span>
                            {asking.target === 'RETIRED'
                              ? `Retire ${copy.assetTag}? This cannot be undone.`
                              : `Change ${copy.assetTag} to ${COPY_STATUS_LABEL[asking.target]}?`}
                          </span>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={saving}
                            aria-describedby={hasError ? errorId : undefined}
                            onClick={() => void confirm(copy, asking.target)}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            disabled={saving}
                            onClick={() => setConfirming(null)}
                          >
                            Cancel
                          </button>
                          {hasError && (
                            <div id={errorId} className="text-danger small w-100">
                              {fieldError.message}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
