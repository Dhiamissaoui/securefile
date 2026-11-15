import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmer',
  busy = false,
  tone = 'danger',
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={440}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className={`btn btn--${tone}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Traitement…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm">
        <span className={`confirm__icon confirm__icon--${tone}`}>
          <AlertTriangle size={20} />
        </span>
        <p>{message}</p>
      </div>
    </Modal>
  );
}
