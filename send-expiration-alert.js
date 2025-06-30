import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

// 🟢 Supabase Setup
const supabase = createClient(
    'https://ygyihoulxucbffftfoqw.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlneWlob3VseHVjYmZmZnRmb3F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI3NDA2MzIsImV4cCI6MjA1ODMxNjYzMn0.bsa_OTDn85eoAC1koidAQhaPd9-sLgw9Y9kCRTYkyfY'
);

// 🔧 Config
const SHEET_ID = '1uKoi8fGurno_MFjUTghQtr18QThUIhVQMycoAuXSAJE';
const API_KEY = 'AIzaSyDVwNNqgEUsxVQtW1vOIoOBhDJ57cVzM6o';
const RANGE = 'Sheet1!A1:Z';
const RESEND_API_KEY = 're_PgKzBmK1_DfEoB2r5HyJQgjpQ3VcxBRNk';
const TO_EMAIL = 'campbellkaybriana@yahoo.com';

// 📅 Format MM/DD/YYYY to YYYY-MM-DD
const formatDate = (d) => {
    if (!d || typeof d !== 'string' || !d.includes('/')) return null;
    const [mm, dd, yyyy] = d.split('/');
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
};

// 📥 Get data from Google Sheets
const fetchSheetData = async () => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${RANGE}?key=${API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    return json.values;
};

// 🔎 Fetch all Out-of-Service VINs from Supabase
const getOutOfServiceVINs = async () => {
    const { data, error } = await supabase
        .from('truck_edits')
        .select('vin, status');

    if (error) {
        console.error('❌ Error fetching statuses from Supabase:', error.message);
        return new Set(); // Fallback: include all
    }

    return new Set(
        data
            .filter(row => (row.status || '').toLowerCase() === 'out of service')
            .map(row => row.vin.trim().toUpperCase())
    );
};

// 🚚 Process trucks for upcoming expirations, excluding OOS VINs
const getExpiringTrucks = (rows, excludeVINs) => {
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
        const vinRaw = row[vinIndex]?.trim();
        const vin = vinRaw?.toUpperCase();

        if (vin && excludeVINs.has(vin)) {
            console.log(`⏭️ Skipping truck ${vin} (Out of Service)`);
            continue;
        }

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

// 📧 Send email using Resend
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

// 🚀 Main runner
const main = async () => {
    const [rows, outOfServiceVINs] = await Promise.all([
        fetchSheetData(),
        getOutOfServiceVINs()
    ]);

    const expiring = getExpiringTrucks(rows, outOfServiceVINs);

    if (expiring.length === 0) {
        console.log('📭 No trucks expiring in next 30 days.');
        return;
    }

    const body = expiring.join('\n\n');
    console.log('📦 Sending email:\n', body);
    await sendEmail(body);
};

main().catch(console.error);