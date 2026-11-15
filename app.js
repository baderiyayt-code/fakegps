let selectedLat = 25.212421;
let selectedLng = 77.041336;
let uploadedFile = null;

// 1. Initialize Map
const map = L.map('map').setView([selectedLat, selectedLng], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
const marker = L.marker([selectedLat, selectedLng], { draggable: true }).addTo(map);

marker.on('dragend', (e) => updateCoordinates(e.target.getLatLng().lat, e.target.getLatLng().lng));
map.on('click', (e) => { marker.setLatLng(e.latlng); updateCoordinates(e.latlng.lat, e.latlng.lng); });

function updateCoordinates(lat, lng) {
    selectedLat = lat;
    selectedLng = lng;
    document.getElementById('coordDisplay').innerText = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
}

// 2. Form Validation
const inputs = ['photoUpload', 'datetimePicker', 'shortAddress', 'fullAddress'];
inputs.forEach(id => document.getElementById(id).addEventListener('input', checkReadyState));

document.getElementById('photoUpload').addEventListener('change', (e) => {
    uploadedFile = e.target.files[0];
    checkReadyState();
});

function checkReadyState() {
    const time = document.getElementById('datetimePicker').value;
    const title = document.getElementById('shortAddress').value;
    document.getElementById('downloadBtn').disabled = !(uploadedFile && time && title);
}

// 3. Process Logic
document.getElementById('downloadBtn').addEventListener('click', () => {
    const reader = new FileReader();
    reader.onload = (e) => {
        const originalBase64 = e.target.result;
        const timeInput = document.getElementById('datetimePicker').value;
        
        const stampData = {
            title: document.getElementById('shortAddress').value,
            subtitle: document.getElementById('fullAddress').value,
            bottomText: document.getElementById('altitude').value,
            lat: selectedLat.toFixed(6),
            lng: selectedLng.toFixed(6),
            datetime: formatDisplayDate(timeInput),
            exifDate: formatExifDate(timeInput)
        };

        applyVisualStamp(originalBase64, stampData, (stampedBase64) => {
            const finalImage = injectExifData(stampedBase64, stampData);
            triggerDownload(finalImage, `stamped_${Date.now()}.jpg`);
        });
    };
    reader.readAsDataURL(uploadedFile);
});

// 4. Canvas Visual Stamp
function applyVisualStamp(imgSrc, data, callback) {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const margin = canvas.width * 0.02;
        const stampHeight = canvas.height * 0.25; 
        const stampY = canvas.height - stampHeight - margin;
        
        const mapWidth = stampHeight; 
        const textX = margin + mapWidth;
        const textWidth = canvas.width - textX - margin;

        // Draw Map Background
        ctx.fillStyle = '#dbd9d6';
        ctx.fillRect(margin, stampY, mapWidth, stampHeight);
        
        // Draw Google Pin
        const pinX = margin + (mapWidth / 2);
        const pinY = stampY + (stampHeight / 2);
        const pinRad = stampHeight * 0.08;
        ctx.fillStyle = '#ea4335';
        ctx.beginPath();
        ctx.arc(pinX, pinY - pinRad, pinRad, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(pinX - pinRad, pinY - pinRad);
        ctx.lineTo(pinX + pinRad, pinY - pinRad);
        ctx.lineTo(pinX, pinY + (pinRad * 1.5));
        ctx.fill();
        ctx.fillStyle = '#7a1f16';
        ctx.beginPath();
        ctx.arc(pinX, pinY - pinRad, pinRad * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Draw Text Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(textX, stampY, textWidth, stampHeight);

        // Draw Text
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';
        const p = stampHeight * 0.08;
        
        const titleSize = stampHeight * 0.18;
        ctx.font = `500 ${titleSize}px sans-serif`;
        ctx.fillText(data.title, textX + p, stampY + p);

        const subSize = stampHeight * 0.11;
        ctx.font = `400 ${subSize}px sans-serif`;
        ctx.fillText(data.subtitle, textX + p, stampY + p + titleSize + (p*0.5));
        
        ctx.fillText(`Lat ${data.lat}° Long ${data.lng}°`, textX + p, stampY + p + titleSize + subSize + (p*1.5));
        ctx.fillText(data.datetime, textX + p, stampY + p + titleSize + (subSize*2) + (p*2));
        ctx.fillText(data.bottomText, textX + p, stampY + p + titleSize + (subSize*3) + (p*2.5));

        callback(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.src = imgSrc;
}

// 5. EXIF Injection
function injectExifData(base64Image, data) {
    const latDMS = decimalToRationalDMS(Math.abs(data.lat));
    const lngDMS = decimalToRationalDMS(Math.abs(data.lng));
    
    const zeroth = {}; const exif = {}; const gps = {};
    zeroth[piexif.ImageIFD.DateTime] = data.exifDate;
    exif[piexif.ExifIFD.DateTimeOriginal] = data.exifDate;
    exif[piexif.ExifIFD.DateTimeDigitized] = data.exifDate;
    
    gps[piexif.GPSIFD.GPSLatitudeRef] = data.lat >= 0 ? "N" : "S";
    gps[piexif.GPSIFD.GPSLatitude] = latDMS;
    gps[piexif.GPSIFD.GPSLongitudeRef] = data.lng >= 0 ? "E" : "W";
    gps[piexif.GPSIFD.GPSLongitude] = lngDMS;

    const exifBytes = piexif.dump({"0th": zeroth, "Exif": exif, "GPS": gps});
    return piexif.insert(exifBytes, base64Image);
}

// 6. Formatting Helpers
function formatDisplayDate(iso) {
    const d = new Date(iso);
    const pd = (n) => String(n).padStart(2, '0');
    let h = d.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${pd(d.getDate())}/${pd(d.getMonth()+1)}/${String(d.getFullYear()).slice(-2)} ${pd(h)}:${pd(d.getMinutes())} ${ampm} GMT +05:30`;
}

function formatExifDate(iso) {
    const d = new Date(iso);
    const pd = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}:${pd(d.getMonth()+1)}:${pd(d.getDate())} ${pd(d.getHours())}:${pd(d.getMinutes())}:00`;
}

function decimalToRationalDMS(decimal) {
    const deg = Math.floor(decimal);
    const minFloat = (decimal - deg) * 60;
    const min = Math.floor(minFloat);
    return [[deg, 1], [min, 1], [Math.round(((minFloat - min) * 60) * 100), 100]];
}

function triggerDownload(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
}
