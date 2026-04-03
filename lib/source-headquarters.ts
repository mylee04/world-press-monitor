import { buildDisplaySourceName } from '@/lib/source-display';

export type SourceHeadquartersMatch = {
  exact?: string[];
  prefixes?: string[];
  contains?: string[];
};

export type SourceHeadquartersRecord = {
  country: string;
  city: string;
  region: string;
  lat: number;
  lon: number;
  label: string;
  match: SourceHeadquartersMatch;
};

export type ResolvedSourceHeadquarters = {
  city: string;
  region: string;
  lat: number;
  lon: number;
  label: string;
};

function normalizeSourceMatch(value: string): string {
  return buildDisplaySourceName(value || '').trim().toLowerCase();
}

const SOURCE_HEADQUARTERS: SourceHeadquartersRecord[] = [
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5642,
    lon: 126.9769,
    label: 'Chosun Ilbo HQ',
    match: {
      prefixes: ['조선닷컴', 'Chosun'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Yeongdeungpo-gu',
    lat: 37.5254,
    lon: 126.9164,
    label: 'KBS HQ',
    match: {
      exact: ['KBS News'],
      prefixes: ['KBS -'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5669,
    lon: 126.9767,
    label: 'Newsis HQ',
    match: {
      exact: ['Newsis'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jongno-gu',
    lat: 37.5745,
    lon: 126.9803,
    label: 'Yonhap News HQ',
    match: {
      prefixes: ['Yonhap'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5608,
    lon: 126.9922,
    label: 'Maeil Business HQ',
    match: {
      prefixes: ['매일경제 -'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5665,
    lon: 126.9711,
    label: 'Kyunghyang Shinmun HQ',
    match: {
      prefixes: ['경향신문 -'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5587,
    lon: 126.9734,
    label: 'The Korea Times HQ',
    match: {
      prefixes: ['Korea Times'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5612,
    lon: 126.9676,
    label: 'Korea Economic Daily HQ',
    match: {
      prefixes: ['한국경제 -'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5636,
    lon: 126.9764,
    label: 'Aju News HQ',
    match: {
      exact: ['Aju News'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jongno-gu',
    lat: 37.5687,
    lon: 126.9932,
    label: 'Donga Ilbo HQ',
    match: {
      prefixes: ['Donga Ilbo'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Mapo-gu',
    lat: 37.5771,
    lon: 126.8901,
    label: 'JTBC HQ',
    match: {
      prefixes: ['JTBC -'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Mapo-gu',
    lat: 37.5771,
    lon: 126.8901,
    label: 'JoongAng HQ',
    match: {
      prefixes: ['JoongAng -'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5674,
    lon: 126.9779,
    label: 'Seoul Newspaper HQ',
    match: {
      exact: ['Seoul Newspaper'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Yangcheon-gu',
    lat: 37.5289,
    lon: 126.8738,
    label: 'SBS HQ',
    match: {
      prefixes: ['SBS -'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Yongsan-gu',
    lat: 37.5475,
    lon: 126.98,
    label: 'Korea Herald HQ',
    match: {
      prefixes: ['Korea Herald'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Mapo-gu',
    lat: 37.547,
    lon: 126.9588,
    label: 'Hankyoreh HQ',
    match: {
      prefixes: ['한겨레'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5696,
    lon: 127.0142,
    label: 'Daily NK HQ',
    match: {
      prefixes: ['Daily NK'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Minato City',
    lat: 35.6644,
    lon: 139.7596,
    label: 'NTV HQ',
    match: {
      exact: ['NTV'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Shibuya City',
    lat: 35.6656,
    lon: 139.699,
    label: 'NHK HQ',
    match: {
      prefixes: ['NHK News', 'NHK News Web -'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Chiyoda City',
    lat: 35.6868,
    lon: 139.7661,
    label: 'Nikkei HQ',
    match: {
      exact: ['Nikkei'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Chiyoda City',
    lat: 35.6868,
    lon: 139.7661,
    label: 'Yomiuri HQ',
    match: {
      exact: ['Yomiuri'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Chiyoda City',
    lat: 35.6868,
    lon: 139.7661,
    label: 'Sankei HQ',
    match: {
      exact: ['Sankei'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Chuo City',
    lat: 35.6651,
    lon: 139.7708,
    label: 'Asahi Shimbun HQ',
    match: {
      exact: ['Asahi Shimbun'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Minato City',
    lat: 35.6656,
    lon: 139.7594,
    label: 'Kyodo News HQ',
    match: {
      exact: ['Kyodo News'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Chuo City',
    lat: 35.668,
    lon: 139.7672,
    label: 'Jiji Press HQ',
    match: {
      exact: ['Jiji Press'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Shibuya City',
    lat: 35.6625,
    lon: 139.6965,
    label: 'Abema HQ',
    match: {
      prefixes: ['Abema Times'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Minato City',
    lat: 35.6401,
    lon: 139.7471,
    label: 'The Japan Times HQ',
    match: {
      exact: ['The Japan Times'],
    },
  },
  {
    country: 'India',
    city: 'Mumbai',
    region: 'Fort',
    lat: 18.9341,
    lon: 72.8355,
    label: 'Times Group HQ',
    match: {
      prefixes: ['The Times of India'],
    },
  },
  {
    country: 'India',
    city: 'New Delhi',
    region: 'Okhla Industrial Estate',
    lat: 28.5344,
    lon: 77.2731,
    label: 'NDTV HQ',
    match: {
      prefixes: ['NDTV'],
    },
  },
  {
    country: 'India',
    city: 'Noida',
    region: 'Sector 16A Film City',
    lat: 28.5701,
    lon: 77.321,
    label: 'India Today Group HQ',
    match: {
      prefixes: ['India Today'],
    },
  },
  {
    country: 'India',
    city: 'Noida',
    region: 'Sector 10',
    lat: 28.5857,
    lon: 77.3251,
    label: 'The Indian Express HQ',
    match: {
      exact: ['The Indian Express'],
    },
  },
  {
    country: 'India',
    city: 'Chennai',
    region: 'Anna Salai',
    lat: 13.0613,
    lon: 80.2659,
    label: 'The Hindu HQ',
    match: {
      prefixes: ['The Hindu'],
    },
  },
  {
    country: 'India',
    city: 'Mumbai',
    region: 'Lower Parel',
    lat: 18.9983,
    lon: 72.8258,
    label: 'Firstpost HQ',
    match: {
      exact: ['Firstpost'],
    },
  },
  {
    country: 'India',
    city: 'Mumbai',
    region: 'Lower Parel',
    lat: 19.003,
    lon: 72.8264,
    label: 'DNA India HQ',
    match: {
      prefixes: ['DNA India'],
    },
  },
  {
    country: 'India',
    city: 'Gurugram',
    region: 'Sector 44',
    lat: 28.4588,
    lon: 77.0731,
    label: 'Storify News HQ',
    match: {
      exact: ['Storify News'],
    },
  },
  {
    country: 'India',
    city: 'Noida',
    region: 'Sector 63',
    lat: 28.6282,
    lon: 77.3812,
    label: 'Amar Ujala HQ',
    match: {
      prefixes: ['Amar Ujala'],
    },
  },
  {
    country: 'India',
    city: 'Bhubaneswar',
    region: 'Bhubaneswar',
    lat: 20.2961,
    lon: 85.8245,
    label: 'Odishabarta HQ',
    match: {
      exact: ['Odishabarta'],
    },
  },
  {
    country: 'India',
    city: 'Kolkata',
    region: 'Garia',
    lat: 22.4635,
    lon: 88.394,
    label: 'The Times of Bengal HQ',
    match: {
      exact: ['The Times of Bengal'],
    },
  },
  {
    country: 'India',
    city: 'Mumbai',
    region: 'Mumbai',
    lat: 19.076,
    lon: 72.8777,
    label: 'Scroll.in HQ',
    match: {
      exact: ['Scroll.in'],
    },
  },
  {
    country: 'India',
    city: 'Jammu',
    region: 'Jammu',
    lat: 32.7266,
    lon: 74.857,
    label: 'Northlines HQ',
    match: {
      exact: ['Northlines'],
    },
  },
  {
    country: 'India',
    city: 'Chandigarh',
    region: 'Chandigarh',
    lat: 30.7333,
    lon: 76.7794,
    label: 'Chandigarh Metro HQ',
    match: {
      exact: ['Chandigarh Metro'],
    },
  },
  {
    country: 'India',
    city: 'Chandigarh',
    region: 'Chandigarh',
    lat: 30.7333,
    lon: 76.7794,
    label: 'Chandigarh City News HQ',
    match: {
      exact: ['Chandigarh City News'],
    },
  },
  {
    country: 'India',
    city: 'New Delhi',
    region: 'Rajendra Place',
    lat: 28.6427,
    lon: 77.1788,
    label: 'The Quint HQ',
    match: {
      exact: ['The Quint'],
    },
  },
  {
    country: 'India',
    city: 'Hyderabad',
    region: 'Hyderabad',
    lat: 17.385,
    lon: 78.4867,
    label: 'Telangana Today HQ',
    match: {
      exact: ['Telangana Today'],
    },
  },
  {
    country: 'India',
    city: 'Chennai',
    region: 'Chennai',
    lat: 13.0827,
    lon: 80.2707,
    label: 'News Today HQ',
    match: {
      prefixes: ['News Today'],
    },
  },
  {
    country: 'India',
    city: 'Kochi',
    region: 'Ernakulam',
    lat: 9.9312,
    lon: 76.2673,
    label: 'IndiaVision HQ',
    match: {
      exact: ['IndiaVision'],
    },
  },
  {
    country: 'India',
    city: 'New Delhi',
    region: 'Malviya Nagar',
    lat: 28.5355,
    lon: 77.2106,
    label: 'OpIndia HQ',
    match: {
      exact: ['OpIndia'],
    },
  },
  {
    country: 'India',
    city: 'Bhubaneswar',
    region: 'Bhubaneswar',
    lat: 20.2961,
    lon: 85.8245,
    label: 'OrissaPOST HQ',
    match: {
      exact: ['OrissaPOST'],
    },
  },
  {
    country: 'India',
    city: 'Kolkata',
    region: 'Salt Lake City',
    lat: 22.5805,
    lon: 88.4309,
    label: 'TechGenYZ HQ',
    match: {
      exact: ['TechGenYZ'],
    },
  },
  {
    country: 'India',
    city: 'New Delhi',
    region: 'New Delhi',
    lat: 28.6139,
    lon: 77.209,
    label: 'WYM News HQ',
    match: {
      prefixes: ['WYM News'],
    },
  },
  {
    country: 'India',
    city: 'Mysuru',
    region: 'Mysuru',
    lat: 12.2958,
    lon: 76.6394,
    label: 'Star of Mysore HQ',
    match: {
      exact: ['Star of Mysore'],
    },
  },
  {
    country: 'India',
    city: 'Noida',
    region: 'Sector 125',
    lat: 28.5265,
    lon: 77.3692,
    label: 'ABP Network HQ',
    match: {
      exact: ['ABP News'],
    },
  },
  {
    country: 'India',
    city: 'New Delhi',
    region: 'New Delhi',
    lat: 28.6139,
    lon: 77.209,
    label: 'The India Bizz HQ',
    match: {
      exact: ['The India Bizz'],
    },
  },
  {
    country: 'India',
    city: 'New Delhi',
    region: 'Kasturba Gandhi Marg',
    lat: 28.6286,
    lon: 77.2202,
    label: 'Hindustan Times HQ',
    match: {
      prefixes: ['Hindustan Times'],
    },
  },
  {
    country: 'India',
    city: 'New Delhi',
    region: 'Bahadur Shah Zafar Marg',
    lat: 28.6325,
    lon: 77.242,
    label: 'ThePrint HQ',
    match: {
      prefixes: ['ThePrint'],
    },
  },
  {
    country: 'India',
    city: 'Bengaluru',
    region: 'Mahatma Gandhi Road',
    lat: 12.9748,
    lon: 77.6093,
    label: 'Deccan Herald HQ',
    match: {
      prefixes: ['Deccan Herald'],
    },
  },
  {
    country: 'India',
    city: 'New Delhi',
    region: 'Kasturba Gandhi Marg',
    lat: 28.6286,
    lon: 77.2202,
    label: 'Mint HQ',
    match: {
      prefixes: ['Livemint'],
    },
  },
  {
    country: 'India',
    city: 'New Delhi',
    region: 'Kalkaji',
    lat: 28.5433,
    lon: 77.2588,
    label: 'Inc42 HQ',
    match: {
      exact: ['Inc42'],
    },
  },
  {
    country: 'Netherlands',
    city: 'Rotterdam',
    region: 'Rotterdam',
    lat: 51.9244,
    lon: 4.4777,
    label: 'AD HQ',
    match: {
      prefixes: ['AD'],
    },
  },
  {
    country: 'Netherlands',
    city: 'Amsterdam',
    region: 'Amsterdam',
    lat: 52.3676,
    lon: 4.9041,
    label: 'de Volkskrant HQ',
    match: {
      prefixes: ['de Volkskrant'],
    },
  },
  {
    country: 'Netherlands',
    city: 'Amsterdam',
    region: 'Amsterdam',
    lat: 52.3676,
    lon: 4.9041,
    label: 'Trouw HQ',
    match: {
      prefixes: ['Trouw'],
    },
  },
  {
    country: 'Netherlands',
    city: 'Amsterdam',
    region: 'Amsterdam',
    lat: 52.3676,
    lon: 4.9041,
    label: 'Het Parool HQ',
    match: {
      prefixes: ['Het Parool'],
    },
  },
  {
    country: 'Netherlands',
    city: 'Vlissingen',
    region: 'Vlissingen',
    lat: 51.442,
    lon: 3.5731,
    label: 'PZC HQ',
    match: {
      prefixes: ['PZC'],
    },
  },
  {
    country: 'Netherlands',
    city: 'Enschede',
    region: 'Enschede',
    lat: 52.2215,
    lon: 6.8937,
    label: 'Tubantia HQ',
    match: {
      prefixes: ['Tubantia'],
    },
  },
  {
    country: 'Netherlands',
    city: 'Zwolle',
    region: 'Zwolle',
    lat: 52.5168,
    lon: 6.083,
    label: 'De Stentor HQ',
    match: {
      prefixes: ['De Stentor'],
    },
  },
  {
    country: 'Netherlands',
    city: 'Nijmegen',
    region: 'Nijmegen',
    lat: 51.842,
    lon: 5.8528,
    label: 'De Gelderlander HQ',
    match: {
      prefixes: ['De Gelderlander'],
    },
  },
  {
    country: 'Netherlands',
    city: 'Eindhoven',
    region: 'Eindhoven',
    lat: 51.4416,
    lon: 5.4697,
    label: 'Eindhovens Dagblad HQ',
    match: {
      prefixes: ['Eindhovens Dagblad'],
    },
  },
  {
    country: 'Netherlands',
    city: "'s-Hertogenbosch",
    region: "'s-Hertogenbosch",
    lat: 51.6978,
    lon: 5.3037,
    label: 'Brabants Dagblad HQ',
    match: {
      prefixes: ['Brabants Dagblad'],
    },
  },
  {
    country: 'Netherlands',
    city: 'Breda',
    region: 'Breda',
    lat: 51.5719,
    lon: 4.7683,
    label: 'BN DeStem HQ',
    match: {
      prefixes: ['BN DeStem'],
    },
  },
  {
    country: 'Netherlands',
    city: 'Hilversum',
    region: 'Hilversum',
    lat: 52.2292,
    lon: 5.1669,
    label: 'NOS HQ',
    match: {
      exact: ['NOS', 'NOS Tech', 'NOS op 3', 'NOS Jeugdjournaal', 'Nieuwsuur'],
      prefixes: ['NOS Nieuws', 'NOS Sport'],
    },
  },
  {
    country: 'Denmark',
    city: 'Kolding',
    region: 'Kolding',
    lat: 55.4904,
    lon: 9.4722,
    label: 'TV Syd HQ',
    match: {
      exact: ['TV Syd'],
    },
  },
  {
    country: 'Denmark',
    city: 'Holstebro',
    region: 'Holstebro',
    lat: 56.3601,
    lon: 8.6161,
    label: 'TV Midtvest HQ',
    match: {
      exact: ['TV Midtvest', 'TV MIDTVEST'],
    },
  },
  {
    country: 'Denmark',
    city: 'Copenhagen',
    region: 'Copenhagen',
    lat: 55.6761,
    lon: 12.5683,
    label: 'TV2 Kosmopol HQ',
    match: {
      exact: ['TV2 Kosmopol'],
    },
  },
  {
    country: 'Denmark',
    city: 'Odense',
    region: 'Odense',
    lat: 55.4038,
    lon: 10.4024,
    label: 'TV2 Fyn HQ',
    match: {
      exact: ['TV2 Fyn'],
    },
  },
  {
    country: 'Denmark',
    city: 'Aalborg',
    region: 'Aalborg',
    lat: 57.0488,
    lon: 9.9217,
    label: 'TV2 Nord HQ',
    match: {
      exact: ['TV2 Nord'],
    },
  },
  {
    country: 'Denmark',
    city: 'Aarhus',
    region: 'Aarhus',
    lat: 56.1629,
    lon: 10.2039,
    label: 'TV2 Ostjylland HQ',
    match: {
      exact: ['TV2 Ostjylland'],
    },
  },
  {
    country: 'Denmark',
    city: 'Vordingborg',
    region: 'Vordingborg',
    lat: 55.008,
    lon: 11.9105,
    label: 'TV2 East HQ',
    match: {
      exact: ['TV2 East'],
    },
  },
  {
    country: 'Denmark',
    city: 'Ronne',
    region: 'Bornholm',
    lat: 55.1009,
    lon: 14.7066,
    label: 'TV2 Bornholm HQ',
    match: {
      exact: ['TV2 Bornholm'],
    },
  },
  {
    country: 'Denmark',
    city: 'Copenhagen',
    region: 'Copenhagen',
    lat: 55.6761,
    lon: 12.5683,
    label: 'TV2 Lorry HQ',
    match: {
      exact: ['TV2 Lorry'],
    },
  },
  {
    country: 'Denmark',
    city: 'Copenhagen',
    region: 'Copenhagen',
    lat: 55.6761,
    lon: 12.5683,
    label: 'MigogKBH HQ',
    match: {
      exact: ['MigogKBH'],
    },
  },
  {
    country: 'Denmark',
    city: 'Aarhus',
    region: 'Aarhus',
    lat: 56.1629,
    lon: 10.2039,
    label: 'MigogAarhus HQ',
    match: {
      exact: ['MigogAarhus'],
    },
  },
  {
    country: 'Denmark',
    city: 'Odense',
    region: 'Odense',
    lat: 55.4038,
    lon: 10.4024,
    label: 'MigogOdense HQ',
    match: {
      exact: ['MigogOdense'],
    },
  },
  {
    country: 'Denmark',
    city: 'Aalborg',
    region: 'Aalborg',
    lat: 57.0488,
    lon: 9.9217,
    label: 'MigogAalborg HQ',
    match: {
      exact: ['MigogAalborg'],
    },
  },
  {
    country: 'Sweden',
    city: 'Malmo',
    region: 'Skane',
    lat: 55.605,
    lon: 13.0038,
    label: 'SVT Sydnytt HQ',
    match: {
      exact: ['SVT Lokal - Sydnytt'],
    },
  },
  {
    country: 'Sweden',
    city: 'Karlskrona',
    region: 'Blekinge',
    lat: 56.1612,
    lon: 15.5869,
    label: 'SVT Blekingenytt HQ',
    match: {
      exact: ['SVT Lokal - Blekingenytt'],
    },
  },
  {
    country: 'Sweden',
    city: 'Sundsvall',
    region: 'Vasternorrland',
    lat: 62.3908,
    lon: 17.3069,
    label: 'SVT Mittnytt HQ',
    match: {
      exact: ['SVT Lokal - Mittnytt'],
    },
  },
  {
    country: 'Sweden',
    city: 'Ostersund',
    region: 'Jamtland',
    lat: 63.1792,
    lon: 14.6357,
    label: 'SVT Jamtlandsnytt HQ',
    match: {
      exact: ['SVT Lokal - Jämtlandsnytt'],
    },
  },
  {
    country: 'Sweden',
    city: 'Stockholm',
    region: 'Stockholm',
    lat: 59.3293,
    lon: 18.0686,
    label: 'SVT Stockholm HQ',
    match: {
      exact: ['SVT Lokal - Stockholm'],
    },
  },
  {
    country: 'Sweden',
    city: 'Gothenburg',
    region: 'Vastra Gotaland',
    lat: 57.7089,
    lon: 11.9746,
    label: 'SVT Väst HQ',
    match: {
      exact: ['SVT Lokal - Väst'],
    },
  },
  {
    country: 'Sweden',
    city: 'Uppsala',
    region: 'Uppsala',
    lat: 59.8586,
    lon: 17.6389,
    label: 'SVT Uppsala HQ',
    match: {
      exact: ['SVT Lokal - Uppsala'],
    },
  },
  {
    country: 'Sweden',
    city: 'Gothenburg',
    region: 'Gothenburg',
    lat: 57.7089,
    lon: 11.9746,
    label: 'GT HQ',
    match: {
      prefixes: ['GT'],
    },
  },
  {
    country: 'Sweden',
    city: 'Kalmar',
    region: 'Kalmar',
    lat: 56.6634,
    lon: 16.3568,
    label: 'Barometern HQ',
    match: {
      exact: ['Barometern'],
    },
  },
  {
    country: 'Sweden',
    city: 'Vaxjo',
    region: 'Kronoberg',
    lat: 56.8777,
    lon: 14.8091,
    label: 'Smålandsposten HQ',
    match: {
      exact: ['Smålandsposten'],
    },
  },
  {
    country: 'Sweden',
    city: 'Karlskrona',
    region: 'Blekinge',
    lat: 56.1612,
    lon: 15.5869,
    label: 'BLT HQ',
    match: {
      exact: ['BLT'],
    },
  },
  {
    country: 'Canada',
    city: 'Edmonton',
    region: 'Alberta',
    lat: 53.5461,
    lon: -113.4938,
    label: 'Edmonton Sun HQ',
    match: {
      exact: ['Edmonton Sun'],
    },
  },
  {
    country: 'Canada',
    city: 'Vancouver',
    region: 'British Columbia',
    lat: 49.2827,
    lon: -123.1207,
    label: 'Business in Vancouver HQ',
    match: {
      exact: ['Business in Vancouver'],
    },
  },
  {
    country: 'Canada',
    city: 'Vancouver',
    region: 'British Columbia',
    lat: 49.2827,
    lon: -123.1207,
    label: 'The Georgia Straight HQ',
    match: {
      exact: ['The Georgia Straight'],
    },
  },
  {
    country: 'Canada',
    city: 'Kingston',
    region: 'Ontario',
    lat: 44.2312,
    lon: -76.486,
    label: 'YGK News HQ',
    match: {
      exact: ['YGK News'],
    },
  },
  {
    country: 'Canada',
    city: 'Prince Albert',
    region: 'Saskatchewan',
    lat: 53.2033,
    lon: -105.7531,
    label: 'Prince Albert Daily Herald HQ',
    match: {
      exact: ['Prince Albert Daily Herald'],
    },
  },
  {
    country: 'Canada',
    city: 'Vancouver',
    region: 'British Columbia',
    lat: 49.2827,
    lon: -123.1207,
    label: 'The Afro News HQ',
    match: {
      exact: ['The Afro News'],
    },
  },
  {
    country: 'Canada',
    city: 'Vancouver',
    region: 'British Columbia',
    lat: 49.2827,
    lon: -123.1207,
    label: 'CBC BC HQ',
    match: {
      exact: ['CBC BC'],
    },
  },
  {
    country: 'Canada',
    city: 'Toronto',
    region: 'Ontario',
    lat: 43.6532,
    lon: -79.3832,
    label: 'CBC Toronto HQ',
    match: {
      exact: ['CBC Toronto'],
    },
  },
  {
    country: 'Canada',
    city: 'Montreal',
    region: 'Quebec',
    lat: 45.5017,
    lon: -73.5673,
    label: 'CBC Montreal HQ',
    match: {
      exact: ['CBC Montreal'],
    },
  },
  {
    country: 'Canada',
    city: 'Calgary',
    region: 'Alberta',
    lat: 51.0447,
    lon: -114.0719,
    label: 'CBC Calgary HQ',
    match: {
      exact: ['CBC Calgary'],
    },
  },
  {
    country: 'Canada',
    city: 'Edmonton',
    region: 'Alberta',
    lat: 53.5461,
    lon: -113.4938,
    label: 'CBC Edmonton HQ',
    match: {
      exact: ['CBC Edmonton'],
    },
  },
  {
    country: 'Canada',
    city: 'Ottawa',
    region: 'Ontario',
    lat: 45.4215,
    lon: -75.6972,
    label: 'CBC Ottawa HQ',
    match: {
      exact: ['CBC Ottawa'],
    },
  },
  {
    country: 'Canada',
    city: 'Regina',
    region: 'Saskatchewan',
    lat: 50.4452,
    lon: -104.6189,
    label: 'CBC Saskatchewan HQ',
    match: {
      exact: ['CBC Saskatchewan'],
    },
  },
  {
    country: 'Canada',
    city: 'Winnipeg',
    region: 'Manitoba',
    lat: 49.8951,
    lon: -97.1384,
    label: 'CBC Manitoba HQ',
    match: {
      exact: ['CBC Manitoba'],
    },
  },
  {
    country: 'Canada',
    city: 'Fredericton',
    region: 'New Brunswick',
    lat: 45.9636,
    lon: -66.6431,
    label: 'CBC New Brunswick HQ',
    match: {
      exact: ['CBC New Brunswick'],
    },
  },
  {
    country: 'Canada',
    city: 'Halifax',
    region: 'Nova Scotia',
    lat: 44.6488,
    lon: -63.5752,
    label: 'CBC Nova Scotia HQ',
    match: {
      exact: ['CBC Nova Scotia'],
    },
  },
  {
    country: 'Canada',
    city: 'Windsor',
    region: 'Ontario',
    lat: 42.3149,
    lon: -83.0364,
    label: 'CBC Windsor HQ',
    match: {
      exact: ['CBC Windsor'],
    },
  },
  {
    country: 'Canada',
    city: 'Thunder Bay',
    region: 'Ontario',
    lat: 48.3809,
    lon: -89.2477,
    label: 'CBC Thunder Bay HQ',
    match: {
      exact: ['CBC Thunder Bay'],
    },
  },
  {
    country: 'Canada',
    city: 'Sudbury',
    region: 'Ontario',
    lat: 46.4917,
    lon: -80.993,
    label: 'CBC Sudbury HQ',
    match: {
      exact: ['CBC Sudbury'],
    },
  },
  {
    country: 'Canada',
    city: 'Yellowknife',
    region: 'Northwest Territories',
    lat: 62.454,
    lon: -114.3718,
    label: 'CBC North HQ',
    match: {
      exact: ['CBC North'],
    },
  },
  {
    country: 'Canada',
    city: 'Kitchener',
    region: 'Ontario',
    lat: 43.4516,
    lon: -80.4925,
    label: 'CBC Kitchener-Waterloo HQ',
    match: {
      exact: ['CBC Kitchener-Waterloo'],
    },
  },
  {
    country: 'Canada',
    city: "St. John's",
    region: 'Newfoundland and Labrador',
    lat: 47.5615,
    lon: -52.7126,
    label: 'CBC Newfoundland HQ',
    match: {
      exact: ['CBC Newfoundland'],
    },
  },
  {
    country: 'Canada',
    city: 'Charlottetown',
    region: 'Prince Edward Island',
    lat: 46.2382,
    lon: -63.1311,
    label: 'CBC PEI HQ',
    match: {
      exact: ['CBC PEI'],
    },
  },
  {
    country: 'Canada',
    city: 'London',
    region: 'Ontario',
    lat: 42.9849,
    lon: -81.2453,
    label: 'CBC London HQ',
    match: {
      exact: ['CBC London'],
    },
  },
  {
    country: 'Australia',
    city: 'Canberra',
    region: 'Australian Capital Territory',
    lat: -35.2809,
    lon: 149.13,
    label: 'Canberra Times HQ',
    match: {
      exact: ['Canberra Times'],
    },
  },
  {
    country: 'Australia',
    city: 'Newcastle',
    region: 'New South Wales',
    lat: -32.9283,
    lon: 151.7817,
    label: 'Newcastle Herald HQ',
    match: {
      exact: ['Newcastle Herald'],
    },
  },
  {
    country: 'Australia',
    city: 'Wollongong',
    region: 'New South Wales',
    lat: -34.4278,
    lon: 150.8931,
    label: 'Illawarra Mercury HQ',
    match: {
      exact: ['Illawarra Mercury'],
    },
  },
  {
    country: 'Australia',
    city: 'Ballarat',
    region: 'Victoria',
    lat: -37.5622,
    lon: 143.8503,
    label: 'The Courier HQ',
    match: {
      exact: ['The Courier'],
    },
  },
  {
    country: 'Australia',
    city: 'Albury',
    region: 'New South Wales',
    lat: -36.08,
    lon: 146.9167,
    label: 'Border Mail HQ',
    match: {
      exact: ['Border Mail'],
    },
  },
  {
    country: 'Australia',
    city: 'Burnie',
    region: 'Tasmania',
    lat: -41.054,
    lon: 145.903,
    label: 'The Advocate HQ',
    match: {
      exact: ['The Advocate'],
    },
  },
  {
    country: 'Australia',
    city: 'Wagga Wagga',
    region: 'New South Wales',
    lat: -35.1082,
    lon: 147.3598,
    label: 'Daily Advertiser HQ',
    match: {
      exact: ['Daily Advertiser'],
    },
  },
  {
    country: 'Australia',
    city: 'Orange',
    region: 'New South Wales',
    lat: -33.283,
    lon: 149.1,
    label: 'Central Western Daily HQ',
    match: {
      exact: ['Central Western Daily'],
    },
  },
  {
    country: 'Australia',
    city: 'Launceston',
    region: 'Tasmania',
    lat: -41.4332,
    lon: 147.1441,
    label: 'The Examiner HQ',
    match: {
      exact: ['The Examiner'],
    },
  },
  {
    country: 'Australia',
    city: 'Bendigo',
    region: 'Victoria',
    lat: -36.757,
    lon: 144.2794,
    label: 'Bendigo Advertiser HQ',
    match: {
      exact: ['Bendigo Advertiser'],
    },
  },
  {
    country: 'Australia',
    city: 'Mount Isa',
    region: 'Queensland',
    lat: -20.7256,
    lon: 139.4927,
    label: 'North West Star HQ',
    match: {
      exact: ['North West Star'],
    },
  },
  {
    country: 'Australia',
    city: 'Goulburn',
    region: 'New South Wales',
    lat: -34.7548,
    lon: 149.72,
    label: 'Goulburn Post HQ',
    match: {
      exact: ['Goulburn Post'],
    },
  },
  {
    country: 'Australia',
    city: 'Taree',
    region: 'New South Wales',
    lat: -31.9102,
    lon: 152.453,
    label: 'Manning River Times HQ',
    match: {
      exact: ['Manning River Times'],
    },
  },
  {
    country: 'Australia',
    city: 'Port Macquarie',
    region: 'New South Wales',
    lat: -31.4333,
    lon: 152.9089,
    label: 'Port Macquarie News HQ',
    match: {
      exact: ['Port Macquarie News'],
    },
  },
  {
    country: 'Australia',
    city: 'Katoomba',
    region: 'New South Wales',
    lat: -33.7126,
    lon: 150.3119,
    label: 'Blue Mountains Gazette HQ',
    match: {
      exact: ['Blue Mountains Gazette'],
    },
  },
  {
    country: 'Australia',
    city: 'Melbourne',
    region: 'Victoria',
    lat: -37.8136,
    lon: 144.9631,
    label: 'The Conversation AU HQ',
    match: {
      exact: ['The Conversation AU'],
    },
  },
  {
    country: 'Australia',
    city: 'Canberra',
    region: 'Australian Capital Territory',
    lat: -35.2809,
    lon: 149.13,
    label: 'The Mandarin HQ',
    match: {
      exact: ['The Mandarin'],
    },
  },
  {
    country: 'Ireland',
    city: 'Letterkenny',
    region: 'County Donegal',
    lat: 54.9538,
    lon: -7.7407,
    label: 'Donegal Daily HQ',
    match: {
      exact: ['Donegal Daily'],
    },
  },
  {
    country: 'Ireland',
    city: 'Ennis',
    region: 'County Clare',
    lat: 52.8436,
    lon: -8.9864,
    label: 'Clare Echo HQ',
    match: {
      exact: ['Clare Echo'],
    },
  },
  {
    country: 'Ireland',
    city: 'Cork',
    region: 'County Cork',
    lat: 51.8985,
    lon: -8.4756,
    label: 'Echo Live HQ',
    match: {
      exact: ['Echo Live'],
    },
  },
  {
    country: 'Ireland',
    city: 'Galway',
    region: 'County Galway',
    lat: 53.2707,
    lon: -9.0568,
    label: 'Connacht Tribune HQ',
    match: {
      exact: ['Connacht Tribune'],
    },
  },
  {
    country: 'Ireland',
    city: 'Limerick',
    region: 'County Limerick',
    lat: 52.6638,
    lon: -8.6267,
    label: 'Limerick Post HQ',
    match: {
      exact: ['Limerick Post'],
    },
  },
  {
    country: 'Ireland',
    city: 'Ennis',
    region: 'County Clare',
    lat: 52.8436,
    lon: -8.9864,
    label: 'Clare Champion HQ',
    match: {
      exact: ['Clare Champion'],
    },
  },
];

function matchesSource(record: SourceHeadquartersRecord, source: string): boolean {
  const normalized = normalizeSourceMatch(source);
  const exact = (record.match.exact || []).map(normalizeSourceMatch);
  if (exact.includes(normalized)) return true;

  const prefixes = (record.match.prefixes || []).map(normalizeSourceMatch);
  if (prefixes.some((prefix) => normalized.startsWith(prefix))) return true;

  const contains = (record.match.contains || []).map(normalizeSourceMatch);
  if (contains.some((fragment) => normalized.includes(fragment))) return true;

  return false;
}

export function resolveSourceHeadquarters(source: string, country: string): ResolvedSourceHeadquarters | null {
  const record = SOURCE_HEADQUARTERS.find((entry) => entry.country === country && matchesSource(entry, source));
  if (!record) return null;
  return {
    city: record.city,
    region: record.region,
    lat: record.lat,
    lon: record.lon,
    label: record.label,
  };
}
