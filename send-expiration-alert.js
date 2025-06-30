import fetch from 'node-fetch';

const SHEET_ID = '1uKoi8fGurno_MFjUTghQtr18QThUIhVQMycoAuXSAJE';
const API_KEY = 'AIzaSyDVwNNqgEUsxVQtW1vOIoOBhDJ57cVzM6o';
const RANGE = 'Sheet1!A1:Z';
const RESEND_API_KEY = 're_PgKzBmK1_DfEoB2r5HyJQgjpQ3VcxBRNk'; // <-- ⛳️ Replace this
const TO_EMAIL = 'campbellkaybriana@yahoo.com';

const formatDate = (d) => {
  if (!d || typeof d !== 'string' || !d.includes('/')) return null;
  const [mm, dd, yyyy] = d.split('/');
  if (!mm || !dd || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
};

const fetchSheetData = async () => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${RANGE}?key=${API_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  return json.values;
};

const getExpiringTrucks = (rows) => {
  const headers = rows[0];
  const vinIndex = headers.findIndex(h => h.toLowerCase().includes('vin'));
  const plateIndex = headers.findIndex(h => h.toLowerCase().includes('plate'));
  const regIndex = headers.findIndex(h => h.toLowerCase().includes('reg'));
  const insIndex = headers.findIndex(h => h.toLowerCase().includes('ins'));
  const inspIndex = headers.findIndex(h => h.toLowerCase().includes('insp'));

  const today = new Date();
  const in30Days = new Date();
  in30Days.setDate(today.getDate() + 30);

  const alerts = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const vin = row[vinIndex]?.trim() ?? 'N/A';
    const plate = row[plateIndex]?.trim() ?? 'N/A';
    const reg = row[regIndex]?.trim();
    const ins = row[insIndex]?.trim();
    const insp = row[inspIndex]?.trim();

    const checkDate = (label, raw) => {
      if (!raw || typeof raw !== 'string' || !raw.includes('/')) return null;
      const [mm, dd, yyyy] = raw.split('/');
      const parsed = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`);
      if (parsed < today) return `🟥 ${label} Expired: ${raw}`;
      if (parsed >= today && parsed <= in30Days) return `🟧 ${label} Expiring Soon: ${raw}`;
      return null;
    };

    const flags = [
      checkDate('Registration', reg),
      checkDate('Insurance', ins),
      checkDate('Inspection', insp),
    ].filter(Boolean);

    if (flags.length > 0) {
      alerts.push(`🚚 VIN: ${vin}\nPlate: ${plate}\n${flags.join('\n')}`);
    }
  }

  return alerts;
};

const sendEmail = async (bodyText) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Fleet Alerts <onboarding@resend.dev>',
      to: TO_EMAIL,
      subject: '🚨 Upcoming Truck Expirations (Next 30 Days)',
      text: bodyText,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to send email: ${error}`);
  }

  console.log('✅ Expiration email sent to:', TO_EMAIL);
};

const main = async () => {
  const rows = await fetchSheetData();
  const expiring = getExpiringTrucks(rows);

  if (expiring.length === 0) {
    console.log('📭 No trucks expiring in next 30 days.');
    return;
  }

  const body = expiring.join('\n\n');
  console.log('📦 Sending email:\n', body);
  await sendEmail(body);
};

main().catch(console.error);
