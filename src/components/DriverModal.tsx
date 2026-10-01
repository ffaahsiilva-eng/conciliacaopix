import React, { useState, useEffect } from 'react';
import { Driver } from '../types';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Truck, X, AlertCircle, Save } from 'lucide-react';

interface DriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverToEdit: Driver | null;
  onSuccess: () => void;
}

export const DriverModal: React.FC<DriverModalProps> = ({
  isOpen,
  onClose,
  driverToEdit,
  onSuccess
}) => {
  const { currentUser } = useAuth();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [route, setRoute] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (driverToEdit) {
      setName(driverToEdit.name);
      setCode(driverToEdit.code);
      setCpf(driverToEdit.cpf || '');
      setPhone(driverToEdit.phone || '');
      setVehiclePlate(driverToEdit.vehicle_plate);
      setVehicleModel(driverToEdit.vehicle_model || '');
      setRoute(driverToEdit.route || '');
      setNotes(driverToEdit.notes || '');
      setActive(driverToEdit.active === 1);
    } else {
      setName('');
      setCode('');
      setCpf('');
      setPhone('');
      setVehiclePlate('');
      setVehicleModel('');
      setRoute('');
      setNotes('');
      setActive(true);
    }
    setErrorMsg(null);
  }, [driverToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('O nome do motorista é obrigatório.');
      return;
    }
    if (!vehiclePlate.trim()) {
      setErrorMsg('A placa do veículo é obrigatória.');
      return;
    }
    if (!currentUser) {
      setErrorMsg('Usuário não autenticado.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);

      const payload = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        cpf: cpf.trim(),
        phone: phone.trim(),
        vehicle_plate: vehiclePlate.trim().toUpperCase(),
        vehicle_model: vehicleModel.trim(),
        route: route.trim(),
        notes: notes.trim(),
        active: active ? 1 : 0
      };

      if (driverToEdit) {
        await api.updateDriver(driverToEdit.id, payload, currentUser);
      } else {
        await api.createDriver(payload, currentUser);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar motorista.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl text-slate-800 overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 p-2 rounded-xl text-blue-700 border border-blue-200">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                {driverToEdit ? 'Editar Motorista' : 'Novo Motorista da Empresa'}
              </h3>
              <p className="text-xs text-slate-500">
                Cadastro para vinculação dos comprovantes e recebimentos Pix
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  Nome Completo do Motorista *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos Roberto Alcantara"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Código / Matrícula</label>
                <input
                  type="text"
                  placeholder="Ex: MOT-06"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 uppercase focus:outline-none focus:border-blue-500 font-bold shadow-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">CPF do Motorista</label>
                <input
                  type="text"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Telefone / WhatsApp</label>
                <input
                  type="text"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Placa do Veículo *</label>
                <input
                  type="text"
                  required
                  placeholder="ABC-1234 ou BRA-2E19"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 uppercase font-mono font-bold focus:outline-none focus:border-blue-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Modelo do Veículo</label>
                <input
                  type="text"
                  placeholder="Ex: Mercedes Accelo / VW Delivery"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Rota / Filial Padrão</label>
              <input
                type="text"
                placeholder="Ex: Rota Zona Norte / SP ou Rota Entregas Campinas"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Observações Internas</label>
              <textarea
                rows={2}
                placeholder="Ex: Entrega comprovantes na portaria no retorno da rota"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900 focus:outline-none focus:border-blue-500 resize-none shadow-xs"
              />
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="driver-active"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 bg-white border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="driver-active" className="text-slate-800 cursor-pointer font-bold">
                Motorista ativo para novas conciliações
              </label>
            </div>

            {errorMsg && (
              <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex items-center space-x-2 text-red-800">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-600 hover:text-slate-900 px-3 py-2 font-semibold cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-xs cursor-pointer transition-all"
            >
              {loading ? (
                <span>Salvando...</span>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{driverToEdit ? 'Salvar Alterações' : 'Cadastrar Motorista'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
