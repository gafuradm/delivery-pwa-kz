import React, { useRef } from 'react';
import QRCode from 'react-qr-code';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface ReceiptProps {
  order: {
    id: string;
    from_address: string;
    to_address: string;
    price: number;
    weight_kg: number;
    fragile: boolean;
    created_at: string;
    delivered_at?: string;
    signature_url?: string;
    photo_url?: string;
    client_signature_url?: string;
  };
  onClose: () => void;
}

export default function Receipt({ order, onClose }: ReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  const downloadAsImage = async () => {
    if (!receiptRef.current) return;
    const canvas = await html2canvas(receiptRef.current);
    const link = document.createElement('a');
    link.download = `receipt_${order.id.slice(0,8)}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const downloadAsPDF = async () => {
    if (!receiptRef.current) return;
    const canvas = await html2canvas(receiptRef.current);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgWidth = 210;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    pdf.save(`receipt_${order.id.slice(0,8)}.pdf`);
  };

  const barcodeUrl = `https://barcode.tec-it.com/barcode.ashx?data=${order.id}&code=Code128&dpi=96`;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ background: 'white', padding: 20, borderRadius: 10, maxWidth: '90%', maxHeight: '90%', overflow: 'auto' }}>
        <div ref={receiptRef} style={{ padding: 20, fontFamily: 'monospace', width: '500px', background: 'white' }}>
          <h2 style={{ textAlign: 'center' }}>КВИТАНЦИЯ О ДОСТАВКЕ</h2>
          <p><strong>Номер заказа:</strong> {order.id}</p>
          <p><strong>Дата создания:</strong> {new Date(order.created_at).toLocaleString()}</p>
          {order.delivered_at && <p><strong>Дата доставки:</strong> {new Date(order.delivered_at).toLocaleString()}</p>}
          <hr />
          <p><strong>Отправитель (склад):</strong><br />{order.from_address}</p>
          <p><strong>Получатель:</strong><br />{order.to_address}</p>
          <hr />
          <p><strong>Вес:</strong> {order.weight_kg} кг</p>
          <p><strong>Хрупкий груз:</strong> {order.fragile ? 'Да' : 'Нет'}</p>
          <p><strong>Стоимость доставки:</strong> {order.price} ₸</p>
          <hr />
          {order.signature_url && (
            <div>
              <p><strong>Подпись курьера:</strong></p>
              <img src={order.signature_url} alt="Подпись курьера" style={{ maxWidth: '200px', border: '1px solid #ccc' }} />
            </div>
          )}
          {order.client_signature_url && (
            <div>
              <p><strong>Подпись клиента:</strong></p>
              <img src={order.client_signature_url} alt="Подпись клиента" style={{ maxWidth: '200px', border: '1px solid #ccc' }} />
            </div>
          )}
          {order.photo_url && (
            <div>
              <p><strong>Фото доставленного заказа:</strong></p>
              <img src={order.photo_url} alt="Фото" style={{ maxWidth: '100%' }} />
            </div>
          )}
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ width: 80, height: 80 }}>
              <QRCode value={order.id} size={80} style={{ width: '100%', height: '100%' }} />
            </div>
            <img src={barcodeUrl} alt="Штрихкод" style={{ height: 40 }} />
          </div>
          <p style={{ fontSize: 10, textAlign: 'center', marginTop: 20 }}>Документ сгенерирован автоматически. Подпись подтверждает получение.</p>
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
          <button onClick={downloadAsImage}>Скачать как PNG</button>
          <button onClick={downloadAsPDF}>Скачать как PDF</button>
          <button onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}