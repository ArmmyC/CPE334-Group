import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  equipmentTypeCreateBodySchema,
  equipmentTypeEditBodySchema,
  type CustodianEquipmentType,
} from '@cpe334-group/shared';
import {
  ApiRequestError,
  createEquipmentType,
  fetchCustodianEquipmentTypes,
  updateEquipmentType,
} from './api';
import { useAuth } from './auth';
import { errorMessage, useLoad } from './useLoad';

type FormValues = {
  labId: string;
  name: string;
  category: string;
  description: string;
  loanPeriodDays: string;
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

const EMPTY: FormValues = {
  labId: '',
  name: '',
  category: '',
  description: '',
  loanPeriodDays: '7',
};

type Parsed<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };

// Maps a shared-schema result to the page: the API's own messages, one per field (BR-05). The
// page stops a bad value early, and the API still decides.
function toResult<T>(result: Parsed<T>): { data: T | null; errors: FieldErrors } {
  if (result.success) return { data: result.data, errors: {} };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    errors[String(issue.path[0]) as keyof FormValues] ??= issue.message;
  }
  return { data: null, errors };
}

function fieldsOf(values: FormValues) {
  return {
    name: values.name,
    category: values.category,
    description: values.description,
    loanPeriodDays: values.loanPeriodDays.trim() === '' ? undefined : Number(values.loanPeriodDays),
  };
}

const checkEdit = (values: FormValues) =>
  toResult(equipmentTypeEditBodySchema.safeParse(fieldsOf(values)));

const checkCreate = (values: FormValues) =>
  toResult(
    equipmentTypeCreateBodySchema.safeParse({
      ...fieldsOf(values),
      labId: values.labId === '' ? undefined : Number(values.labId),
    }),
  );

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: (props: {
    id: string;
    className: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  }) => React.ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      {children({
        id,
        className: `form-control${error ? ' is-invalid' : ''}`,
        'aria-invalid': Boolean(error),
        'aria-describedby': error ? errorId : undefined,
      })}
      {error && (
        <div id={errorId} className="invalid-feedback d-block">
          {error}
        </div>
      )}
    </div>
  );
}

function TypeFields({
  prefix,
  values,
  errors,
  disabled,
  labs,
  onChange,
}: {
  prefix: string;
  values: FormValues;
  errors: FieldErrors;
  disabled: boolean;
  labs?: { id: number; name: string }[];
  onChange: (values: FormValues) => void;
}) {
  const set = (field: keyof FormValues) => (event: { target: { value: string } }) =>
    onChange({ ...values, [field]: event.target.value });
  return (
    <>
      {labs && (
        <Field id={`${prefix}-lab`} label="Lab" error={errors.labId}>
          {(props) => (
            <select
              {...props}
              className={props.className.replace('form-control', 'form-select')}
              value={values.labId}
              disabled={disabled}
              onChange={set('labId')}
            >
              <option value="">Choose a lab</option>
              {labs.map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {lab.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <Field id={`${prefix}-name`} label="Name" error={errors.name}>
        {(props) => (
          <input
            {...props}
            type="text"
            value={values.name}
            disabled={disabled}
            onChange={set('name')}
          />
        )}
      </Field>
      <Field id={`${prefix}-category`} label="Category" error={errors.category}>
        {(props) => (
          <input
            {...props}
            type="text"
            value={values.category}
            disabled={disabled}
            onChange={set('category')}
          />
        )}
      </Field>
      <Field id={`${prefix}-description`} label="Description" error={errors.description}>
        {(props) => (
          <textarea
            {...props}
            rows={2}
            value={values.description}
            disabled={disabled}
            onChange={set('description')}
          />
        )}
      </Field>
      <Field id={`${prefix}-period`} label="Loan period (days)" error={errors.loanPeriodDays}>
        {(props) => (
          <input
            {...props}
            type="number"
            value={values.loanPeriodDays}
            disabled={disabled}
            onChange={set('loanPeriodDays')}
          />
        )}
      </Field>
    </>
  );
}

function EditDialog({
  type,
  onClose,
  onSaved,
  onGone,
}: {
  type: CustodianEquipmentType;
  onClose: () => void;
  onSaved: () => void;
  onGone: () => void;
}) {
  const { recheck } = useAuth();
  const [values, setValues] = useState<FormValues>({
    labId: String(type.lab.id),
    name: type.name,
    category: type.category,
    description: type.description,
    loanPeriodDays: String(type.loanPeriodDays),
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const { data, errors: found } = checkEdit(values);
    setErrors(found);
    if (!data) return;
    setSubmitting(true);
    try {
      await updateEquipmentType(type.id, data);
      onSaved();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        recheck();
      } else if (error instanceof ApiRequestError && error.status === 404) {
        onGone();
        return;
      } else if (error instanceof ApiRequestError && Object.keys(error.fields).length > 0) {
        setErrors(error.fields as FieldErrors);
      } else {
        setMessage(
          error instanceof ApiRequestError ? error.message : 'Could not reach the server.',
        );
      }
      setSubmitting(false);
    }
  }

  const titleId = `edit-type-title-${type.id}`;
  return (
    <>
      <div className="modal-backdrop fade show" />
      <div
        ref={dialogRef}
        className="modal fade show d-block"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !submitting) onClose();
        }}
      >
        <div className="modal-dialog modal-dialog-centered">
          <form className="modal-content" onSubmit={(event) => void save(event)} noValidate>
            <div className="modal-header">
              <h2 className="modal-title h5" id={titleId}>
                Edit {type.name}
              </h2>
            </div>
            <div className="modal-body">
              <p className="mb-3">Lab: {type.lab.name}</p>
              {message && (
                <div role="alert" className="alert alert-danger">
                  {message}
                </div>
              )}
              <TypeFields
                prefix="edit"
                values={values}
                errors={errors}
                disabled={submitting}
                onChange={setValues}
              />
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={submitting}
                onClick={onClose}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// F-12: the equipment types in the custodian's labs, a form to add one, and a dialog to edit one.
// The API checks scope and the rules again, and the page shows its answer.
export function EquipmentTypesPage() {
  const { recheck } = useAuth();
  const {
    state: load,
    reload,
    refresh,
  } = useLoad(fetchCustodianEquipmentTypes, 'custodian-equipment-types');
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustodianEquipmentType | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);
    const { data, errors: found } = checkCreate(values);
    setErrors(found);
    if (!data) return;
    setSaving(true);
    try {
      await createEquipmentType(data);
      setValues({ ...EMPTY, labId: values.labId });
      setSuccess('Saved.');
      refresh();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        recheck();
      } else if (error instanceof ApiRequestError && Object.keys(error.fields).length > 0) {
        setErrors(error.fields as FieldErrors);
      } else {
        setMessage(
          error instanceof ApiRequestError ? error.message : 'Could not reach the server.',
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h1 className="h3">Equipment types</h1>
      {message && (
        <div className="alert alert-danger" role="alert">
          {message}
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
          <span>{errorMessage(load.error, 'Could not load equipment types.')}</span>
          <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => reload()}>
            Retry
          </button>
        </div>
      )}
      {load.status === 'ready' && (
        <>
          {load.data.items.length === 0 ? (
            <p className="text-body-secondary">No equipment types in your labs yet.</p>
          ) : (
            <div className="table-responsive">
              <table className="table align-middle">
                <thead>
                  <tr>
                    <th scope="col">Lab</th>
                    <th scope="col">Name</th>
                    <th scope="col">Category</th>
                    <th scope="col">Loan period</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {load.data.items.map((type) => (
                    <tr key={type.id}>
                      <td>{type.lab.name}</td>
                      <td>{type.name}</td>
                      <td>{type.category}</td>
                      <td>{`${type.loanPeriodDays} days`}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          aria-label={`Edit ${type.name}`}
                          onClick={() => {
                            setSuccess(null);
                            setEditing(type);
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h2 className="h5 mt-4">Add equipment type</h2>
          <form
            onSubmit={(event) => void add(event)}
            noValidate
            className="mb-4"
            style={{ maxWidth: '32rem' }}
          >
            <TypeFields
              prefix="add"
              values={values}
              errors={errors}
              disabled={saving}
              labs={load.data.labs}
              onChange={setValues}
            />
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Add equipment type'}
            </button>
          </form>
        </>
      )}
      {editing && (
        <EditDialog
          type={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setSuccess('Saved.');
            refresh();
          }}
          onGone={() => {
            setEditing(null);
            setMessage('Equipment type not found.');
            refresh();
          }}
        />
      )}
    </section>
  );
}
