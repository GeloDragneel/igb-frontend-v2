import Modal from "./Modal";

export default function ConfirmDialog({ title, message, confirmLabel = "Delete", onCancel, onConfirm }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </>
      }
    >
      <p className="confirm-text">{message}</p>
    </Modal>
  );
}
