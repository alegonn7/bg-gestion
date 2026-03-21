import React from "react";

interface UpdateChangelogModalProps {
  isOpen: boolean;
  changelog: string;
  onClose: () => void;
}

const UpdateChangelogModal: React.FC<UpdateChangelogModalProps> = ({ isOpen, changelog, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg max-w-lg w-full p-6 relative">
        <h2 className="text-xl font-bold mb-2 text-blue-700">¡La app se actualizó!</h2>
        <div className="mb-4 text-gray-700 whitespace-pre-line" style={{ maxHeight: 300, overflowY: 'auto' }}>{changelog}</div>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition font-medium float-right"
          onClick={onClose}
        >
          Entendido
        </button>
      </div>
    </div>
  );
};

export default UpdateChangelogModal;
