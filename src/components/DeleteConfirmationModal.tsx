type DeleteConfirmationModalProps = {
  itemName: string;
  isConfirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function DeleteConfirmationModal({
  itemName,
  isConfirming = false,
  onCancel,
  onConfirm,
}: DeleteConfirmationModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirmation-title"
      >
        <div>
          <h2 id="delete-confirmation-title">Are you sure?</h2>
          <p>
            You are about to delete {itemName}. This action cannot be undone.
          </p>
        </div>
        <div className="confirm-modal-actions">
          <button className="ghost-button" type="button" onClick={onCancel} disabled={isConfirming}>
            Cancel
          </button>
          <button className="danger-button" type="button" onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? "Deleting" : "Yes, I know"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default DeleteConfirmationModal;
