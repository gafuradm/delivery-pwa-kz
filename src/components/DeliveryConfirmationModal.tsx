import React, { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '../lib/supabaseClient';

interface DeliveryConfirmationModalProps {
  orderId: string;
  onClose: () => void;
  onConfirm: (photoUrl: string, signatureUrl: string) => void;
}

export default function DeliveryConfirmationModal({ orderId, onClose, onConfirm }: DeliveryConfirmationModalProps) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const signatureRef = useRef<SignatureCanvas>(null);

  // Фото через камеру
  const takePhoto = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => setPhoto(reader.result as string);
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const clearSignature = () => signatureRef.current?.clear();

  const confirmDelivery = async () => {
    if (!photo) {
      alert('Сделайте фото заказа');
      return;
    }
    const signatureDataURL = signatureRef.current?.toDataURL();
    if (!signatureDataURL || signatureDataURL === 'data:,') {
      alert('Поставьте подпись');
      return;
    }
    setUploading(true);

    // Загружаем фото в Supabase Storage
    const photoBlob = await fetch(photo).then(r => r.blob());
    const photoPath = `delivery_photos/${orderId}_${Date.now()}.jpg`;
    const { error: photoError } = await supabase.storage.from('delivery').upload(photoPath, photoBlob);
    if (photoError) throw photoError;

    // Загружаем подпись
    const signatureBlob = await fetch(signatureDataURL).then(r => r.blob());
    const signaturePath = `signatures/${orderId}_${Date.now()}.png`;
    const { error: sigError } = await supabase.storage.from('delivery').upload(signaturePath, signatureBlob);
    if (sigError) throw sigError;

    // Возвращаем публичные URL
    const { data: photoPublic } = supabase.storage.from('delivery').getPublicUrl(photoPath);
    const { data: sigPublic } = supabase.storage.from('delivery').getPublicUrl(signaturePath);
    onConfirm(photoPublic.publicUrl, sigPublic.publicUrl);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ background: 'white', padding: 20, borderRadius: 10, maxWidth: '90%', maxHeight: '90%', overflow: 'auto' }}>
        <h3>Подтверждение доставки</h3>
        <div>
          <p>Фото заказа:</p>
          {photo ? <img src={photo} alt="Фото" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} /> : <div style={{ background: '#eee', padding: 20, textAlign: 'center' }}>Нет фото</div>}
          <button onClick={takePhoto}>📷 Сделать фото</button>
        </div>
        <div>
          <p>Электронная подпись получателя:</p>
          <SignatureCanvas ref={signatureRef} canvasProps={{ width: 300, height: 150, style: { border: '1px solid #ccc' } }} />
          <button onClick={clearSignature}>Очистить</button>
        </div>
        <div style={{ marginTop: 20 }}>
          <button onClick={confirmDelivery} disabled={uploading}>Подтвердить доставку</button>
          <button onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}