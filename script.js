// Weather — live conditions from Open-Meteo, rendered inside a
// glass dashboard that floats over an animated sky. The canvas
// layer reacts to the actual weather code + day/night flag: sun
// rays, drifting clouds, falling rain or snow, and storm flashes.

const cityInput = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const locationBtn = document.getElementById('location-btn');
const unitToggle = document.getElementById('unit-toggle');
const loader = document.getElementById('loader');
const dashboard = document.getElementById('dashboard-content');
const alertContainer = document.getElementById('alert-container');
const alertText = document.getElementById('alert-text');

let hourlyChart = null;
let lastData = null;
let lastPlaceName = '';
let unit = localStorage.getItem('weather-unit') || 'c';

const weatherCodes = {
    0:  { desc: 'Clear sky',            icon: 'fa-sun',                 sky: 'clear' },
    1:  { desc: 'Mostly clear',         icon: 'fa-sun',                 sky: 'clear' },
    2:  { desc: 'Partly cloudy',        icon: 'fa-cloud-sun',           sky: 'cloudy' },
    3:  { desc: 'Overcast',             icon: 'fa-cloud',               sky: 'cloudy' },
    45: { desc: 'Fog',                  icon: 'fa-smog',                sky: 'fog' },
    48: { desc: 'Freezing fog',         icon: 'fa-smog',                sky: 'fog' },
    51: { desc: 'Light drizzle',        icon: 'fa-cloud-rain',          sky: 'rain' },
    53: { desc: 'Drizzle',              icon: 'fa-cloud-rain',          sky: 'rain' },
    55: { desc: 'Dense drizzle',        icon: 'fa-cloud-rain',          sky: 'rain' },
    61: { desc: 'Light rain',           icon: 'fa-cloud-showers-heavy', sky: 'rain' },
    63: { desc: 'Rain',                 icon: 'fa-cloud-showers-heavy', sky: 'rain' },
    65: { desc: 'Heavy rain',           icon: 'fa-cloud-showers-heavy', sky: 'rain' },
    71: { desc: 'Light snow',           icon: 'fa-snowflake',           sky: 'snow' },
    73: { desc: 'Snow',                 icon: 'fa-snowflake',           sky: 'snow' },
    75: { desc: 'Heavy snow',           icon: 'fa-snowflake',           sky: 'snow' },
    95: { desc: 'Thunderstorm',         icon: 'fa-bolt',                sky: 'storm' },
};
const getWeatherInfo = (code) => weatherCodes[code] || { desc: 'Unknown', icon: 'fa-question', sky: 'cloudy' };

const cToDisplay = (c) => (unit === 'f' ? Math.round(c * 9 / 5 + 32) : Math.round(c));
const kmhToDisplay = (kmh) => (unit === 'f' ? `${Math.round(kmh / 1.609)} mph` : `${Math.round(kmh)} km/h`);

function uvLabel(uv) {
    if (uv == null || Number.isNaN(uv)) return '—';
    const val = Math.round(uv * 10) / 10;
    if (uv < 3) return `${val} · Low`;
    if (uv < 6) return `${val} · Moderate`;
    if (uv < 8) return `${val} · High`;
    if (uv < 11) return `${val} · Very high`;
    return `${val} · Extreme`;
}

function formatClock(isoString) {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ==================================================================
// Sky engine — canvas particle layer, driven by real weather + time
// ==================================================================

const skyCanvas = document.getElementById('sky-canvas');
const ctx2d = skyCanvas.getContext('2d');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let W = 0, H = 0, DPR = 1;
let particles = [];
let currentMood = 'clear-day';
let rafId = null;
let lastFlash = 0;

function resizeCanvas() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    skyCanvas.width = W * DPR;
    skyCanvas.height = H * DPR;
    ctx2d.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function rand(min, max) { return Math.random() * (max - min) + min; }

function buildParticles(mood) {
    particles = [];
    const density = Math.min(W, 1400) / 1400;

    if (mood === 'clear-day' || mood === 'clear-night') {
        const count = mood === 'clear-night' ? Math.floor(90 * density) : Math.floor(5 * density);
        for (let i = 0; i < count; i++) {
            particles.push({
                type: mood === 'clear-night' ? 'star' : 'cloud',
                x: rand(0, W), y: rand(0, H * 0.55),
                r: mood === 'clear-night' ? rand(0.6, 1.8) : rand(60, 140),
                speed: mood === 'clear-night' ? 0 : rand(4, 10),
                twinkle: rand(0, Math.PI * 2),
                alpha: rand(0.35, 0.9),
            });
        }
    } else if (mood === 'cloudy' || mood === 'storm') {
        const count = Math.floor((mood === 'storm' ? 10 : 8) * density);
        for (let i = 0; i < count; i++) {
            particles.push({
                type: 'cloud', x: rand(0, W), y: rand(0, H * 0.5),
                r: rand(90, 190), speed: rand(6, 14),
                alpha: rand(0.3, 0.55),
            });
        }
    } else if (mood === 'fog') {
        const count = Math.floor(6 * density);
        for (let i = 0; i < count; i++) {
            particles.push({
                type: 'mist', x: rand(0, W), y: rand(H * 0.2, H),
                r: rand(160, 320), speed: rand(3, 8), alpha: rand(0.12, 0.22),
            });
        }
    }

    if (mood === 'rain' || mood === 'storm') {
        const count = Math.floor((mood === 'storm' ? 220 : 160) * density);
        for (let i = 0; i < count; i++) {
            particles.push({
                type: 'rain', x: rand(0, W), y: rand(0, H),
                len: rand(10, 22), speed: rand(9, 16), drift: rand(-1, -2.5),
                alpha: rand(0.3, 0.6),
            });
        }
    }

    if (mood === 'snow') {
        const count = Math.floor(130 * density);
        for (let i = 0; i < count; i++) {
            particles.push({
                type: 'snow', x: rand(0, W), y: rand(0, H),
                r: rand(1.5, 4), speed: rand(0.6, 1.8), sway: rand(0, Math.PI * 2),
                alpha: rand(0.5, 0.95),
            });
        }
    }
}

function drawFrame(t) {
    ctx2d.clearRect(0, 0, W, H);

    for (const p of particles) {
        if (p.type === 'cloud') {
            p.x += p.speed * 0.016;
            if (p.x - p.r > W) p.x = -p.r;
            const g = ctx2d.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
            g.addColorStop(0, `rgba(255,255,255,${p.alpha})`);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx2d.fillStyle = g;
            ctx2d.beginPath();
            ctx2d.ellipse(p.x, p.y, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
            ctx2d.fill();
        } else if (p.type === 'star') {
            p.twinkle += 0.02;
            const a = p.alpha * (0.55 + 0.45 * Math.sin(p.twinkle));
            ctx2d.fillStyle = `rgba(255,255,255,${a})`;
            ctx2d.beginPath();
            ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx2d.fill();
        } else if (p.type === 'mist') {
            p.x += p.speed * 0.016;
            if (p.x - p.r > W) p.x = -p.r;
            const g = ctx2d.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
            g.addColorStop(0, `rgba(255,255,255,${p.alpha})`);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx2d.fillStyle = g;
            ctx2d.beginPath();
            ctx2d.ellipse(p.x, p.y, p.r, p.r * 0.4, 0, 0, Math.PI * 2);
            ctx2d.fill();
        } else if (p.type === 'rain') {
            p.y += p.speed;
            p.x += p.drift * 0.4;
            if (p.y > H) { p.y = -p.len; p.x = rand(0, W); }
            ctx2d.strokeStyle = `rgba(190,225,255,${p.alpha})`;
            ctx2d.lineWidth = 1.2;
            ctx2d.beginPath();
            ctx2d.moveTo(p.x, p.y);
            ctx2d.lineTo(p.x + p.drift, p.y + p.len);
            ctx2d.stroke();
        } else if (p.type === 'snow') {
            p.y += p.speed;
            p.sway += 0.02;
            p.x += Math.sin(p.sway) * 0.6;
            if (p.y > H) { p.y = -4; p.x = rand(0, W); }
            ctx2d.fillStyle = `rgba(255,255,255,${p.alpha})`;
            ctx2d.beginPath();
            ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx2d.fill();
        }
    }

    // sun glow for clear days
    if (currentMood === 'clear-day') {
        const cx = W * 0.82, cy = H * 0.16;
        const g = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, 220);
        g.addColorStop(0, 'rgba(255,235,180,0.45)');
        g.addColorStop(1, 'rgba(255,235,180,0)');
        ctx2d.fillStyle = g;
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, 220, 0, Math.PI * 2);
        ctx2d.fill();
    }

    // occasional lightning flash during storms
    if (currentMood === 'storm' && t - lastFlash > rand(2500, 6000)) {
        lastFlash = t;
        flashLightning();
    }

    if (!prefersReducedMotion) rafId = requestAnimationFrame(drawFrame);
}

function flashLightning() {
    let frame = 0;
    const flicker = () => {
        frame++;
        ctx2d.fillStyle = frame % 2 === 0 ? 'rgba(230,220,255,0.28)' : 'rgba(230,220,255,0)';
        ctx2d.fillRect(0, 0, W, H);
        if (frame < 4) requestAnimationFrame(flicker);
    };
    flicker();
}

function setSkyMood(code, isDay) {
    const info = getWeatherInfo(code);
    const mood = info.sky === 'clear' ? (isDay ? 'clear-day' : 'clear-night') : info.sky;
    if (mood === currentMood) return;
    currentMood = mood;

    document.body.className = `sky-${mood}`;
    buildParticles(mood);

    if (prefersReducedMotion) {
        drawFrame(0);
    } else if (!rafId) {
        rafId = requestAnimationFrame(drawFrame);
    }
}

// ==================================================================
// Units
// ==================================================================

function setUnitButtons() {
    unitToggle.querySelectorAll('.unit-option').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.unit === unit);
    });
}

unitToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.unit-option');
    if (!btn || btn.dataset.unit === unit) return;
    unit = btn.dataset.unit;
    localStorage.setItem('weather-unit', unit);
    setUnitButtons();
    if (lastData) {
        renderCurrent(lastData, lastPlaceName);
        renderChart(lastData.hourly);
        renderForecast(lastData.daily);
    }
});

// ==================================================================
// Data fetching
// ==================================================================

async function getCoordinates(place) {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`);
    const data = await res.json();
    if (!data.results || data.results.length === 0) throw new Error('not found');
    return data.results[0];
}

async function loadWeather(lat, lon, placeName) {
    dashboard.classList.remove('is-visible');
    dashboard.style.display = 'none';
    alertContainer.style.display = 'none';
    loader.style.display = 'flex';

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
            + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day`
            + `&hourly=temperature_2m,relative_humidity_2m`
            + `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max`
            + `&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('bad response');
        const data = await res.json();

        lastData = data;
        lastPlaceName = placeName;
        localStorage.setItem('weather-last-place', JSON.stringify({ lat, lon, name: placeName }));

        renderCurrent(data, placeName);
        renderChart(data.hourly);
        renderForecast(data.daily);

        loader.style.display = 'none';
        dashboard.style.display = 'block';
        requestAnimationFrame(() => dashboard.classList.add('is-visible'));
    } catch (err) {
        loader.style.display = 'none';
        alertContainer.style.display = 'block';
        alertText.textContent = `Couldn't load the forecast — the weather service may be unreachable. Try again in a moment.`;
        console.error(err);
    }
}

// ==================================================================
// Rendering
// ==================================================================

function renderCurrent(data, placeName) {
    const current = data.current;
    const daily = data.daily;
    const info = getWeatherInfo(current.weather_code);
    setSkyMood(current.weather_code, current.is_day);

    document.getElementById('city-name').textContent = placeName;
    document.getElementById('date-time').textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
    });
    document.getElementById('current-temp').textContent = cToDisplay(current.temperature_2m);
    document.getElementById('feels-like-temp').textContent = cToDisplay(current.apparent_temperature);
    document.getElementById('weather-desc').textContent = info.desc;
    document.getElementById('current-icon').className = `fas ${info.icon} weather-icon`;
    document.getElementById('current-humidity').textContent = `${current.relative_humidity_2m}%`;
    document.getElementById('current-wind').textContent = kmhToDisplay(current.wind_speed_10m);
    document.getElementById('current-uv').textContent = uvLabel(daily.uv_index_max ? daily.uv_index_max[0] : null);
    document.getElementById('current-sunrise').textContent = formatClock(daily.sunrise ? daily.sunrise[0] : null);
    document.getElementById('current-sunset').textContent = formatClock(daily.sunset ? daily.sunset[0] : null);

    const severe = current.wind_speed_10m > 40 || current.temperature_2m > 45 || current.weather_code === 95;
    if (severe) {
        alertContainer.style.display = 'block';
        alertText.textContent = `Severe weather right now — wind ${kmhToDisplay(current.wind_speed_10m)}, ${cToDisplay(current.temperature_2m)}°.`;
    }
}

function renderForecast(daily) {
    const grid = document.getElementById('forecast-grid');
    grid.innerHTML = '';

    for (let i = 1; i <= 7; i++) {
        const date = new Date(daily.time[i]);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const info = getWeatherInfo(daily.weather_code[i]);
        const hi = cToDisplay(daily.temperature_2m_max[i]);
        const lo = cToDisplay(daily.temperature_2m_min[i]);

        const card = document.createElement('div');
        card.className = 'forecast-day';
        card.innerHTML = `
            <h4>${dayName}</h4>
            <i class="fas ${info.icon}"></i>
            <div class="cond">${info.desc}</div>
            <div class="minmax"><span class="hi">${hi}°</span><span class="lo">${lo}°</span></div>
        `;
        grid.appendChild(card);
    }
}

function renderChart(hourly) {
    const canvasCtx = document.getElementById('hourlyChart').getContext('2d');

    const labels = hourly.time.slice(0, 24).map((t) => {
        const d = new Date(t);
        return `${d.getHours().toString().padStart(2, '0')}:00`;
    });
    const temps = hourly.temperature_2m.slice(0, 24).map(cToDisplay);
    const humidity = hourly.relative_humidity_2m.slice(0, 24);
    const tempLabel = `Temperature (°${unit.toUpperCase()})`;

    if (hourlyChart) hourlyChart.destroy();

    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
    Chart.defaults.color = 'rgba(255,255,255,0.72)';

    hourlyChart = new Chart(canvasCtx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: tempLabel,
                    data: temps,
                    borderColor: '#FFB266',
                    backgroundColor: 'rgba(255, 178, 102, 0.18)',
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: true,
                    pointRadius: 0,
                    yAxisID: 'y',
                },
                {
                    label: 'Humidity (%)',
                    data: humidity,
                    borderColor: '#7FD9FF',
                    borderWidth: 1.5,
                    borderDash: [4, 3],
                    tension: 0.35,
                    pointRadius: 0,
                    yAxisID: 'y1',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 14, padding: 16, font: { size: 11 } } },
                tooltip: {
                    backgroundColor: 'rgba(15, 12, 24, 0.9)',
                    titleColor: '#FFFFFF',
                    bodyColor: '#FFFFFF',
                    borderColor: 'rgba(255,255,255,0.15)',
                    borderWidth: 1,
                    padding: 10,
                },
            },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.06)' } },
                y: { type: 'linear', position: 'left', grid: { color: 'rgba(255,255,255,0.08)' }, ticks: { color: '#FFB266' } },
                y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#7FD9FF' } },
            },
        },
    });
}

// ==================================================================
// Interactions
// ==================================================================

searchBtn.addEventListener('click', async () => {
    const place = cityInput.value.trim();
    if (!place) return;
    searchBtn.disabled = true;
    try {
        const loc = await getCoordinates(place);
        await loadWeather(loc.latitude, loc.longitude, `${loc.name}, ${loc.country}`);
    } catch {
        alertContainer.style.display = 'block';
        alertText.textContent = `Couldn't find that place — check the spelling and try again.`;
    } finally {
        searchBtn.disabled = false;
    }
});

cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchBtn.click();
});

locationBtn.addEventListener('click', () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        (pos) => loadWeather(pos.coords.latitude, pos.coords.longitude, 'Your location'),
        () => {
            alertContainer.style.display = 'block';
            alertText.textContent = `Location access was blocked — allow it in your browser, or search a city instead.`;
        }
    );
});

// ==================================================================
// Startup
// ==================================================================

setUnitButtons();

const savedPlace = (() => {
    try { return JSON.parse(localStorage.getItem('weather-last-place')); }
    catch { return null; }
})();

if (savedPlace && typeof savedPlace.lat === 'number' && typeof savedPlace.lon === 'number') {
    loadWeather(savedPlace.lat, savedPlace.lon, savedPlace.name);
} else {
    getCoordinates('Cairo').then((loc) => loadWeather(loc.latitude, loc.longitude, loc.name));
}
