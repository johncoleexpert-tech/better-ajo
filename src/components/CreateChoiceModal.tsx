import { Users, User, X } from 'lucide-react';

export default function CreateChoiceModal({ isOpen, onClose, onSelectPersonal, onSelectGroup }: any) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-[480px] p-6 relative shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full"><X size={18}/></button>
        <h2 className="text-2xl font-bold text-center">Create New Ajo</h2>
        <p className="text-center text-gray-500 text-sm mt-1 mb-6">Choose which type you want</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button onClick={() => { onClose(); onSelectPersonal(); }} className="border-2 border-green-200 hover:border-green-600 hover:bg-green-50 p-5 rounded-2xl text-left">
            <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center mb-3"><User className="text-white" /></div>
            <h3 className="font-bold">Personal Ajo</h3>
            <p className="text-xs text-gray-500 mt-1">Save for yourself daily/weekly</p>
            <p className="text-green-600 font-bold text-sm mt-3">Create →</p>
          </button>
          <button onClick={() => { onClose(); onSelectGroup(); }} className="border-2 border-blue-200 hover:border-blue-600 hover:bg-blue-50 p-5 rounded-2xl text-left">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mb-3"><Users className="text-white" /></div>
            <h3 className="font-bold">Group Ajo</h3>
            <p className="text-xs text-gray-500 mt-1">Create group, invite members</p>
            <p className="text-blue-600 font-bold text-sm mt-3">Create →</p>
          </button>
        </div>
      </div>
    </div>
  );
}
