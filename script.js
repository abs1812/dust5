// 내부 Vercel 서버리스 프록시 API 엔드포인트 주소
const API_URL = '/api/dust';

// DOM 요소 참조 변수 선언
const sidoSelect = document.getElementById('sidoSelect');
const selectedRegionName = document.getElementById('selectedRegionName');
const trafficCard = document.getElementById('trafficCard');
const trafficEmoji = document.getElementById('trafficEmoji');
const trafficGrade = document.getElementById('trafficGrade');
const trafficTime = document.getElementById('trafficTime');
const averagePm10 = document.getElementById('averagePm10');
const trafficAdvice = document.getElementById('trafficAdvice');
const averageStatus = document.getElementById('averageStatus');
const stationCount = document.getElementById('stationCount');
const cardListContainer = document.getElementById('cardList');
const chartEmptyMessage = document.getElementById('chartEmptyMessage');

// Chart.js 인스턴스 전역 관리 변수
let dustChartInstance = null;

// 대기오염 등급 정보 매핑 (1: 좋음 🔵, 2: 보통 🟢, 3: 나쁨 🟠, 4: 매우나쁨 🔴)
const GRADE_CONFIG = {
  '1': { text: '좋음', emoji: '🔵', cardClass: 'card-grade-1', badgeClass: 'badge-1', color: '#2563eb' },
  '2': { text: '보통', emoji: '🟢', cardClass: 'card-grade-2', badgeClass: 'badge-2', color: '#16a34a' },
  '3': { text: '나쁨', emoji: '🟠', cardClass: 'card-grade-3', badgeClass: 'badge-3', color: '#ea580c' },
  '4': { text: '매우나쁨', emoji: '🔴', cardClass: 'card-grade-4', badgeClass: 'badge-4', color: '#dc2626' }
};

// 미세먼지 수치 포맷 함수 (유효하지 않거나 "-"인 경우 '측정 안 됨' 표시)
function formatValue(val) {
  if (val === null || val === undefined || val === '' || val === '-') {
    return '측정 안 됨';
  }
  return `${val} ㎍/㎥`;
}

// 등급 객체 반환 함수 (등급 값이 비어있거나 올바르지 않으면 회색 기본값 처리)
function getGradeInfo(grade, value) {
  if (GRADE_CONFIG[grade]) {
    return GRADE_CONFIG[grade];
  }
  // grade 값이 비어있는 경우 수치 기준으로 등급 보정 계산
  if (value !== undefined && !isNaN(value)) {
    if (value <= 30) return GRADE_CONFIG['1'];
    if (value <= 80) return GRADE_CONFIG['2'];
    if (value <= 150) return GRADE_CONFIG['3'];
    return GRADE_CONFIG['4'];
  }
  return {
    text: '측정 안 됨',
    emoji: '⚪',
    cardClass: 'card-grade-unknown',
    badgeClass: 'badge-unknown',
    color: '#94a3b8'
  };
}

// 측정 시각을 '2026년 10월 28일 16시 기준'처럼 한국어로 변환하는 포맷 함수
function formatKoreanDateTime(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '측정 시각 정보 없음';

  const match = dateStr.match(/(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})(?:[^\d]+(\d{1,2}))?(?::(\d{2}))?/);
  if (match) {
    const year = match[1];
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const hour = match[4] !== undefined ? parseInt(match[4], 10) : '';
    const minute = match[5] !== undefined ? parseInt(match[5], 10) : 0;

    if (hour !== '') {
      const minText = minute > 0 ? ` ${minute}분` : '';
      return `${year}년 ${month}월 ${day}일 ${hour}시${minText} 기준`;
    }
    return `${year}년 ${month}월 ${day}일 기준`;
  }
  return `${dateStr} 기준`;
}

// 로딩 화면 상태 전환 함수
function setLoadingState(sidoName) {
  selectedRegionName.textContent = sidoName;
  trafficCard.className = 'traffic-card state-loading';
  trafficEmoji.textContent = '⏳';
  trafficGrade.textContent = '불러오는 중...';
  trafficTime.textContent = '불러오는 중...';
  averagePm10.textContent = '-';
  trafficAdvice.textContent = '실시간 대기오염 정보를 불러오는 중입니다...';
  averageStatus.textContent = '';
  stationCount.textContent = '';
  cardListContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>대기질 데이터를 불러오는 중입니다...</p>
    </div>
  `;

  // 기존 차트 파괴 및 비우기
  if (dustChartInstance) {
    dustChartInstance.destroy();
    dustChartInstance = null;
  }
  chartEmptyMessage.style.display = 'block';
  chartEmptyMessage.textContent = '데이터를 불러오는 중입니다...';
}

// 상위 10개 측정소 가로 막대그래프 렌더링 함수 (Chart.js)
function renderTop10Chart(items) {
  const chartCanvas = document.getElementById('dustChart');
  if (!chartCanvas) return;

  // 1. '측정 안 됨'(-) 및 유효하지 않은 수치 제외
  const validItems = items.filter(item => {
    const val = item.pm10Value;
    return val !== null && val !== undefined && val !== '-' && val !== '' && !isNaN(Number(val));
  });

  // 유효한 데이터가 없을 경우 메시지 표시
  if (validItems.length === 0) {
    if (dustChartInstance) {
      dustChartInstance.destroy();
      dustChartInstance = null;
    }
    chartEmptyMessage.style.display = 'block';
    chartEmptyMessage.textContent = '그래프에 표시할 유효한 측정소 데이터가 없습니다.';
    return;
  }

  chartEmptyMessage.style.display = 'none';

  // 2. 미세먼지(pm10Value) 수치가 높은 순으로 정렬 후 상위 10개 추출
  validItems.sort((a, b) => Number(b.pm10Value) - Number(a.pm10Value));
  const top10 = validItems.slice(0, 10);

  // 3. 차트 라벨(측정소명), 데이터(수치), 막대 색상(등급별 색) 구성
  const labels = top10.map(item => item.stationName || '측정소');
  const values = top10.map(item => Number(item.pm10Value));
  const backgroundColors = top10.map(item => {
    const gradeInfo = getGradeInfo(item.pm10Grade, Number(item.pm10Value));
    return gradeInfo.color;
  });

  // 기존 차트가 있으면 삭제 후 재성성
  if (dustChartInstance) {
    dustChartInstance.destroy();
  }

  // Pretendard 기본 폰트 적용
  Chart.defaults.font.family = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

  // 4. 가로 막대그래프 생성 (indexAxis: 'y')
  const ctx = chartCanvas.getContext('2d');
  dustChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '미세먼지 (PM10)',
        data: values,
        backgroundColor: backgroundColors,
        borderRadius: 8,
        borderSkipped: false,
        barThickness: 22
      }]
    },
    options: {
      indexAxis: 'y', // 가로 막대그래프 설정
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false // 범례 숨김
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 13 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (context) => ` 미세먼지 수치: ${context.parsed.x} ㎍/㎥`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: {
            color: '#f1f5f9'
          },
          ticks: {
            font: { size: 11, weight: '500' },
            color: '#64748b',
            callback: (val) => `${val} ㎍/㎥`
          }
        },
        y: {
          grid: {
            display: false
          },
          ticks: {
            font: { size: 12, weight: '700' },
            color: '#1e293b'
          }
        }
      }
    }
  });
}

// 특정 시도의 실시간 대기오염 정보를 서버리스 API(/api/dust)를 통해 조회하는 비동기 함수
async function fetchAirQualityData(sidoName) {
  try {
    // 로딩 상태 표시
    setLoadingState(sidoName);

    // 내부 서버리스 API 호출 (/api/dust?sido=시도명)
    const response = await fetch(`${API_URL}?sido=${encodeURIComponent(sidoName)}`);
    const data = await response.json();

    // 통신 오류 발생 시 에러 처리
    if (!response.ok) {
      throw new Error(data.message || '데이터를 불러오지 못했습니다.');
    }

    const items = data?.response?.body?.items || [];

    // 파싱된 측정소 데이터를 화면과 차트에 렌더링
    renderAirQuality(items, sidoName);
  } catch (error) {
    // 에러 발생 시 사용자 친화적인 안내 문구 표시
    console.error('대기오염 데이터 조회 오류:', error);
    trafficCard.className = 'traffic-card state-unknown';
    trafficEmoji.textContent = '⚠️';
    trafficGrade.textContent = '연결 오류';
    trafficTime.textContent = '조회 실패';
    averagePm10.textContent = '-';
    trafficAdvice.textContent = error.message || '데이터를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.';
    averageStatus.textContent = '인증키 또는 네트워크 연결을 확인하세요.';
    cardListContainer.innerHTML = `<p class="status-msg error">${error.message || '오류가 발생했습니다.'}</p>`;
    
    if (dustChartInstance) {
      dustChartInstance.destroy();
      dustChartInstance = null;
    }
    chartEmptyMessage.style.display = 'block';
    chartEmptyMessage.textContent = '데이터 조회 오류로 그래프를 표시할 수 없습니다.';
  }
}

// 화면에 대기질 데이터를 렌더링하는 함수
function renderAirQuality(items, sidoName) {
  selectedRegionName.textContent = sidoName;

  // 측정 데이터가 없을 경우 예외 처리
  if (!items || items.length === 0) {
    trafficCard.className = 'traffic-card state-unknown';
    trafficEmoji.textContent = '⚪';
    trafficGrade.textContent = '정보 없음';
    trafficTime.textContent = '데이터 없음';
    averagePm10.textContent = '-';
    trafficAdvice.textContent = '조회된 대기질 측정 데이터가 없습니다.';
    cardListContainer.innerHTML = '<p class="status-msg">조회된 측정소가 없습니다.</p>';
    if (dustChartInstance) {
      dustChartInstance.destroy();
      dustChartInstance = null;
    }
    chartEmptyMessage.style.display = 'block';
    chartEmptyMessage.textContent = '조회된 측정소가 없습니다.';
    return;
  }

  // 대표 측정 시각 추출 (첫 번째 측정소의 측정 시각 기준)
  const latestDataTime = items.find(item => item.dataTime)?.dataTime || '';
  trafficTime.textContent = formatKoreanDateTime(latestDataTime);

  // '-' 이거나 유효하지 않은 측정값을 제외하고 순수 숫자값만 추출하여 평균 계산
  const validValues = items
    .map(item => item.pm10Value)
    .filter(val => val !== null && val !== undefined && val !== '-' && val !== '' && !isNaN(Number(val)))
    .map(val => Number(val));

  // 대표 상태 및 평균 수치 계산
  if (validValues.length > 0) {
    const sum = validValues.reduce((acc, curr) => acc + curr, 0);
    const avg = Math.round(sum / validValues.length);
    averagePm10.textContent = avg;

    // 평균 수치 기준 공기 신호등 상태 판정 (한국 환경부 PM10 기준)
    let stateClass = '';
    let emoji = '';
    let gradeText = '';
    let adviceText = '';

    if (avg <= 30) {
      stateClass = 'state-good';
      emoji = '🔵';
      gradeText = '좋음';
      adviceText = '공기가 깨끗하고 상쾌해요! 나들이나 환기를 추천해요.';
    } else if (avg <= 80) {
      stateClass = 'state-normal';
      emoji = '🟢';
      gradeText = '보통';
      adviceText = '무난한 공기질이에요. 일상적인 야외활동에 적합해요.';
    } else if (avg <= 150) {
      stateClass = 'state-bad';
      emoji = '🟠';
      gradeText = '나쁨';
      adviceText = '외출 시 마스크를 챙기세요';
    } else {
      stateClass = 'state-very-bad';
      emoji = '🔴';
      gradeText = '매우나쁨';
      adviceText = '외출 시 마스크를 챙기세요';
    }

    // 신호등 카드 UI 갱신
    trafficCard.className = `traffic-card ${stateClass}`;
    trafficEmoji.textContent = emoji;
    trafficGrade.textContent = gradeText;
    trafficAdvice.textContent = adviceText;
    averageStatus.textContent = `총 ${items.length}개 측정소 중 ${validValues.length}개소 데이터 기준`;
  } else {
    trafficCard.className = 'traffic-card state-unknown';
    trafficEmoji.textContent = '⚪';
    trafficGrade.textContent = '측정 안 됨';
    averagePm10.textContent = '측정 안 됨';
    trafficAdvice.textContent = '현재 수신 가능한 유효 측정 수치가 없습니다.';
    averageStatus.textContent = '측정소 점검 또는 미수신 상태';
  }

  // 상위 10개 측정소 가로 막대그래프 렌더링 호출
  renderTop10Chart(items);

  // 측정소 개수 표기
  stationCount.textContent = `총 ${items.length}개 측정소`;

  // 카드 목록 영역 초기화
  cardListContainer.innerHTML = '';

  // 각 측정소별 카드 동적 생성 및 화면 부착
  items.forEach(item => {
    const stationName = item.stationName || '측정소명 없음';
    const pm10Text = formatValue(item.pm10Value);
    const pm25Text = formatValue(item.pm25Value);
    const formattedTime = formatKoreanDateTime(item.dataTime);
    const gradeInfo = getGradeInfo(item.pm10Grade, Number(item.pm10Value));

    // 개별 측정소 카드 요소 생성 (은은한 배경과 테두리 적용)
    const card = document.createElement('div');
    card.className = `measure-card ${gradeInfo.cardClass}`;
    card.innerHTML = `
      <div class="card-header">
        <span class="station-name">${stationName}</span>
        <span class="grade-badge ${gradeInfo.badgeClass}">
          <span>${gradeInfo.emoji}</span>
          <span>${gradeInfo.text}</span>
        </span>
      </div>
      <div class="card-body">
        <div class="dust-item">
          <span class="dust-label">미세먼지 (PM10)</span>
          <span class="dust-value">${pm10Text}</span>
        </div>
        <div class="dust-item">
          <span class="dust-label">초미세먼지 (PM2.5)</span>
          <span class="dust-value">${pm25Text}</span>
        </div>
      </div>
      <div class="card-footer">
        <span>${formattedTime}</span>
      </div>
    `;

    // 카드 그리드에 부착
    cardListContainer.appendChild(card);
  });
}

// 사용자가 시도 드롭다운을 변경했을 때의 이벤트 처리
sidoSelect.addEventListener('change', (e) => {
  fetchAirQualityData(e.target.value);
});

// 문서가 준비되면 초기 선택 지역(서울) 데이터 조회 실행
document.addEventListener('DOMContentLoaded', () => {
  fetchAirQualityData(sidoSelect.value);
});
