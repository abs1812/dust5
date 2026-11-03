// Vercel 서버리스 함수: 에어코리아 대기오염정보 프록시 API (package.json 없이 단독 실행 지원)
module.exports = async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // GET 요청 여부 검증
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'GET 요청만 허용됩니다.' });
  }

  // 쿼리스트링에서 sido 추출 (기본값: '서울')
  const sido = req.query.sido || '서울';

  // 환경변수에서 Decoding 인증키 로드
  const serviceKey = process.env.AIRKOREA_KEY;

  // 인증키 설정 여부 확인
  if (!serviceKey) {
    return res.status(500).json({ 
      message: '서버 환경변수(AIRKOREA_KEY)가 설정되지 않았습니다. Vercel 환경변수 또는 .env.local을 확인하세요.' 
    });
  }

  try {
    // Decoding 인증키를 URL 인코딩 처리
    const encodedKey = encodeURIComponent(serviceKey.trim());

    // 공공데이터포털 에어코리아 실시간 대기오염정보 API 호출 URL 구성
    const targetUrl = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey=${encodedKey}&returnType=json&sidoName=${encodeURIComponent(sido)}&numOfRows=100&pageNo=1&ver=1.3`;

    // 공공데이터포털에 요청 전송
    const response = await fetch(targetUrl);
    const textData = await response.text();

    // XML 형태의 에러 응답 감지 (키 오류, 트래픽 초과 등)
    if (textData.trim().startsWith('<') || !textData.includes('{')) {
      return res.status(400).json({
        message: '인증키 또는 요청값을 확인해주세요.',
        errorDetail: '공공데이터포털에서 XML 에러가 반환되었습니다.'
      });
    }

    // JSON 형식 파싱
    const jsonData = JSON.parse(textData);
    const header = jsonData?.response?.header;

    // 응답 결과 코드 검증 (정상 코드 '00'이 아닌 경우 에러 처리)
    if (header && header.resultCode !== '00') {
      return res.status(400).json({
        message: `에어코리아 API 오류가 발생했습니다: ${header.resultMsg || '알 수 없는 오류'} (코드: ${header.resultCode})`
      });
    }

    // 정상 데이터 반환
    return res.status(200).json(jsonData);
  } catch (error) {
    // 서버 통신 또는 내부 처리 에러 처리
    console.error('서버리스 함수 처리 오류:', error);
    return res.status(500).json({
      message: '서버 내부 처리 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};
