let selectedLat = 25.212421;
let selectedLng = 77.041336;
let uploadedFile = null;

// 1. Initialize Map
const map = L.map('map').setView([selectedLat, selectedLng], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
const marker = L.marker([selectedLat, selectedLng], { draggable: true }).addTo(map);

marker.on('dragend', (e) => updateLocation(e.target.getLatLng().lat, e.target.getLatLng().lng));
map.on('click', (e) => { marker.setLatLng(e.latlng); updateLocation(e.latlng.lat, e.latlng.lng); });

// 2. Fetch Real Address Details Automatically
async function updateLocation(lat, lng) {
    selectedLat = lat; selectedLng = lng;
    document.getElementById('coordDisplay').innerText = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
    
    try {
        document.getElementById('shortAddress').value = "Fetching location...";
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();

        if (data && data.address) {
            const city = data.address.city || data.address.town || data.address.village || data.address.county || "";
            const state = data.address.state || "";
            const country = data.address.country || "";
            
            const shortArr = [city, state, country].filter(Boolean);
            document.getElementById('shortAddress').value = shortArr.join(', ') + " 🇮🇳";
            document.getElementById('fullAddress').value = data.display_name;
            checkReadyState();
        }
    } catch (error) {
        document.getElementById('shortAddress').value = "Location not found - enter manually";
    }
}

// 3. Form Validation
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

// 4. Process Logic (Passes Original Base64 to preserve orientation)
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
            const finalImage = injectExifData(stampedBase64, stampData, originalBase64);
            triggerDownload(finalImage, `IMG_${Date.now()}.jpg`);
        });
    };
    reader.readAsDataURL(uploadedFile);
});

// 5. Canvas Visual Stamp (Portrait proportion fixes)
function applyVisualStamp(imgSrc, data, callback) {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width; canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Portrait sizing fix: base size on the shortest dimension
        const baseSize = Math.min(canvas.width, canvas.height);
        const margin = canvas.width * 0.02;
        const stampHeight = baseSize * 0.25; 
        const stampY = canvas.height - stampHeight - margin;
        
        const mapWidth = stampHeight; 
        const textX = margin + mapWidth;
        const textWidth = canvas.width - textX - margin;

        ctx.fillStyle = '#dbd9d6';
        ctx.fillRect(margin, stampY, mapWidth, stampHeight);
        
        const pinX = margin + (mapWidth / 2);
        const pinY = stampY + (stampHeight / 2);
        const pinRad = stampHeight * 0.08;
        ctx.fillStyle = '#ea4335';
        ctx.beginPath(); ctx.arc(pinX, pinY - pinRad, pinRad, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(pinX - pinRad, pinY - pinRad); ctx.lineTo(pinX + pinRad, pinY - pinRad); ctx.lineTo(pinX, pinY + (pinRad * 1.5)); ctx.fill();
        ctx.fillStyle = '#7a1f16';
        ctx.beginPath(); ctx.arc(pinX, pinY - pinRad, pinRad * 0.3, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(textX, stampY, textWidth, stampHeight);

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

// 6. EXIF Injection (Preserves Original Portrait Rotation)
function injectExifData(base64Image, data, originalBase64) {
    const latDMS = decimalToRationalDMS(Math.abs(data.lat));
    const lngDMS = decimalToRationalDMS(Math.abs(data.lng));
    
    const zeroth = {}; const exif = {}; const gps = {};
    
    try {
        const origExif = piexif.load(originalBase64);
        if (origExif["0th"] && origExif["0th"][piexif.ImageIFD.Orientation]) {
            zeroth[piexif.ImageIFD.Orientation] = origExif["0th"][piexif.ImageIFD.Orientation];
        }
    } catch(e) {}

    zeroth[piexif.ImageIFD.DateTime] = data.exifDate;
    exif[piexif.ExifIFD.DateTimeOriginal] = data.exifDate;
    exif[piexif.ExifIFD.DateTimeDigitized] = data.exifDate;
    
    gps[piexif.GPSIFD.GPSLatitudeRef] = data.lat >= 0 ? "N" : "S";
    gps[piexif.GPSIFD.GPSLatitude] = latDMS;
    gps[piexif.GPSIFD.GPSLongitudeRef] = data.lng >= 0 ? "E" : "W";
    gps[piexif.GPSIFD.GPSLongitude] = lngDMS;

    return piexif.insert(piexif.dump({"0th": zeroth, "Exif": exif, "GPS": gps}), base64Image);
}

// 7. Format Helpers
function formatDisplayDate(iso) {
    const d = new Date(iso); const pd = (n) => String(n).padStart(2, '0');
    let h = d.getHours(); const ampm = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return `${pd(d.getDate())}/${pd(d.getMonth()+1)}/${String(d.getFullYear()).slice(-2)} ${pd(h)}:${pd(d.getMinutes())} ${ampm} GMT +05:30`;
}
function formatExifDate(iso) {
    const d = new Date(iso); const pd = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}:${pd(d.getMonth()+1)}:${pd(d.getDate())} ${pd(d.getHours())}:${pd(d.getMinutes())}:00`;
}
function decimalToRationalDMS(decimal) {
    const deg = Math.floor(decimal); const minFloat = (decimal - deg) * 60; const min = Math.floor(minFloat);
    return [[deg, 1], [min, 1], [Math.round(((minFloat - min) * 60) * 100), 100]];
}

// 8. Smart Download (Native APK Download Folder OR Web Browser)
function triggerDownload(base64Data, filename) {
    if (window.cordova) {
        const b64Data = base64Data.split(',')[1];
        const byteCharacters = atob(b64Data);
        const byteArrays = [];
        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
            byteArrays.push(new Uint8Array(byteNumbers));
        }
        const blob = new Blob(byteArrays, { type: 'image/jpeg' });

        window.resolveLocalFileSystemURL(cordova.file.externalRootDirectory + 'Download/', function (dirEntry) {
            dirEntry.getFile(filename, { create: true, exclusive: false }, function (fileEntry) {
                fileEntry.createWriter(function (fileWriter) {
                    fileWriter.onwriteend = () => alert("✅ Photo saved to Downloads folder!");
                    fileWriter.onerror = (e) => alert("❌ Error saving: " + e.toString());
                    fileWriter.write(blob);
                }, () => alert("File permission error."));
            }, () => alert("Could not create file."));
        }, () => alert("Could not access Downloads folder."));
    } else {
        const arr = base64Data.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length; const u8arr = new Uint8Array(n);
        while(n--) u8arr[n] = bstr.charCodeAt(n);
        const blob = new Blob([u8arr], {type: mime});
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = filename;
        document.body.appendChild(link); link.click();
        document.body.removeChild(link); URL.revokeObjectURL(url);
    }
}
