// 4. Process Logic (Updated to pass originalBase64 to EXIF injector)
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
            // Pass originalBase64 to preserve orientation
            const finalImage = injectExifData(stampedBase64, stampData, originalBase64);
            triggerDownload(finalImage, `IMG_${Date.now()}.jpg`);
        });
    };
    reader.readAsDataURL(uploadedFile);
});

// 5. Canvas Visual Stamp (Updated math for Portrait photos)
function applyVisualStamp(imgSrc, data, callback) {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width; 
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // FIX: Use the smaller dimension to calculate stamp size.
        // This ensures the stamp looks perfectly sized whether Portrait or Landscape.
        const baseSize = Math.min(canvas.width, canvas.height);
        
        const margin = canvas.width * 0.02;
        const stampHeight = baseSize * 0.25; // 25% of the shortest side
        const stampY = canvas.height - stampHeight - margin;
        const mapWidth = stampHeight; 
        const textX = margin + mapWidth;
        const textWidth = canvas.width - textX - margin;

        // Backgrounds
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

        // Text Drawing
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

// 6. EXIF Injection (Updated to preserve original Photo Orientation)
function injectExifData(base64Image, data, originalBase64) {
    const latDMS = decimalToRationalDMS(Math.abs(data.lat));
    const lngDMS = decimalToRationalDMS(Math.abs(data.lng));
    
    const zeroth = {}; const exif = {}; const gps = {};
    
    // FIX: Try to copy original orientation so portrait photos don't flip sideways
    try {
        const origExif = piexif.load(originalBase64);
        if (origExif["0th"] && origExif["0th"][piexif.ImageIFD.Orientation]) {
            zeroth[piexif.ImageIFD.Orientation] = origExif["0th"][piexif.ImageIFD.Orientation];
        }
    } catch(e) { console.log("No original EXIF found."); }

    zeroth[piexif.ImageIFD.DateTime] = data.exifDate;
    exif[piexif.ExifIFD.DateTimeOriginal] = data.exifDate;
    exif[piexif.ExifIFD.DateTimeDigitized] = data.exifDate;
    
    gps[piexif.GPSIFD.GPSLatitudeRef] = data.lat >= 0 ? "N" : "S";
    gps[piexif.GPSIFD.GPSLatitude] = latDMS;
    gps[piexif.GPSIFD.GPSLongitudeRef] = data.lng >= 0 ? "E" : "W";
    gps[piexif.GPSIFD.GPSLongitude] = lngDMS;

    return piexif.insert(piexif.dump({"0th": zeroth, "Exif": exif, "GPS": gps}), base64Image);
}
