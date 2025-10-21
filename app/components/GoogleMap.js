"use client";
import { useEffect, useRef } from 'react';

// ジャンル別のピンカラー
const genreColors = {
  'ファストフード': '#ef4444',
  '定食・食堂': '#f97316',
  'カフェ': '#eab308',
  '居酒屋': '#84cc16',
  'ファミレス': '#06b6d4',
  '和食': '#8b5cf6',
  '中華': '#ec4899',
  '洋食': '#14b8a6',
  '未分類': '#6b7280',
};

export default function GoogleMap({ menuData, onShopClick }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    const initMap = async () => {
      // すでに地図が初期化されていたら何もしない
      if (mapRef.current) return;
      if (!mapContainerRef.current) return;

      // 既存のGoogle Mapsスクリプトをチェック
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');

      if (!existingScript) {
        // Google Maps JavaScript APIをロード
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
        script.async = true;
        script.defer = true;

        script.onload = () => {
          initializeMap();
        };

        document.head.appendChild(script);
      } else {
        // すでに読み込まれている場合は直接初期化
        if (window.google && window.google.maps) {
          initializeMap();
        } else {
          existingScript.addEventListener('load', initializeMap);
        }
      }
    };

    const initializeMap = () => {
      if (!window.google || !mapContainerRef.current) return;

      console.log('[GoogleMap] menuData件数:', menuData.length);
      console.log('[GoogleMap] menuDataサンプル:', menuData.slice(0, 2));
      console.log('[GoogleMap] 最初のメニュー詳細:', JSON.stringify(menuData[0], null, 2));

      // 店舗ごとにグループ化（緯度経度がある店舗のみ）
      const shopLocations = {};
      menuData.forEach(item => {
        if (item.latitude && item.longitude && item.shop) {
          if (!shopLocations[item.shop]) {
            shopLocations[item.shop] = {
              shop: item.shop,
              genre: item.genre || '未分類',
              latitude: item.latitude,
              longitude: item.longitude,
              menuCount: 0,
            };
          }
          shopLocations[item.shop].menuCount++;
        }
      });

      const shops = Object.values(shopLocations);
      const center = { lat: 35.7080, lng: 139.7731 }; // 上野広小路交差点

      console.log('[GoogleMap] 店舗数:', shops.length);
      console.log('[GoogleMap] サンプル店舗:', shops.slice(0, 3));

      // 地図を初期化
      const map = new window.google.maps.Map(mapContainerRef.current, {
        center: center,
        zoom: 17,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      mapRef.current = map;

      // 200m半径の円を追加
      new window.google.maps.Circle({
        map: map,
        center: center,
        radius: 200,
        strokeColor: '#667eea',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#667eea',
        fillOpacity: 0.1,
      });

      // 店舗マーカーを追加
      console.log('[GoogleMap] マーカーを作成開始...');
      shops.forEach((shop, index) => {
        console.log(`[GoogleMap] マーカー${index + 1}/${shops.length}:`, shop.shop, shop.latitude, shop.longitude);

        // カスタムマーカー（丸型、シンプルな青）
        const marker = new window.google.maps.Marker({
          position: { lat: shop.latitude, lng: shop.longitude },
          map: map,
          title: shop.shop,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: '#34A853',  // 緑色
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2.5,
            scale: 8,
          },
        });

        // この店舗のメニューリストを取得
        const shopMenus = menuData.filter(item => item.shop === shop.shop);

        // メニューリストのHTMLを生成
        const menuListHTML = shopMenus.slice(0, 5).map(menu => `
          <div style="
            padding: 6px 8px;
            margin-bottom: 4px;
            background: #f9fafb;
            border-radius: 4px;
            cursor: pointer;
            border: 1px solid #e5e7eb;
          " onclick="window.handleMenuClick('${menu.shop.replace(/'/g, "\\'")}', '${menu.menu.replace(/'/g, "\\'")}')">
            <div style="font-size: 12px; font-weight: 600; color: #111; margin-bottom: 2px;">${menu.menu}</div>
            <div style="font-size: 11px; color: #666;">${menu.calories || '-'} kcal / P: ${menu.protein || '-'}g</div>
          </div>
        `).join('');

        const moreCount = shopMenus.length > 5 ? `<div style="font-size: 11px; color: #666; text-align: center; margin-top: 4px;">他${shopMenus.length - 5}件のメニュー</div>` : '';

        // 情報ウィンドウ
        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div style="padding: 8px; min-width: 220px; max-width: 280px; max-height: 400px; overflow-y: auto;">
              <h3 style="font-size: 14px; font-weight: bold; margin: 0 0 4px 0; color: #111;">${shop.shop}</h3>
              <p style="font-size: 11px; color: #666; margin: 0 0 10px 0;">【${shop.genre}】 ${shop.menuCount}メニュー</p>
              <div style="margin-bottom: 8px;">
                ${menuListHTML}
                ${moreCount}
              </div>
              <button
                onclick="window.handleShopClick('${shop.shop.replace(/'/g, "\\'")}')"
                style="
                  width: 100%;
                  padding: 8px 16px;
                  background: #667eea;
                  color: white;
                  border: none;
                  border-radius: 6px;
                  font-size: 12px;
                  font-weight: bold;
                  cursor: pointer;
                "
              >
                全メニューを見る
              </button>
            </div>
          `,
        });

        marker.addListener('click', () => {
          // 他の情報ウィンドウを閉じる
          markersRef.current.forEach(m => m.infoWindow.close());
          infoWindow.open(map, marker);
        });

        markersRef.current.push({ marker, infoWindow });
      });

      // グローバル関数を設定（情報ウィンドウのボタンから呼ばれる）
      window.handleShopClick = (shopName) => {
        onShopClick(shopName);
      };

      // メニュークリック用のグローバル関数
      window.handleMenuClick = (shopName, menuName) => {
        // メニュー詳細に直接遷移するためのロジック
        onShopClick(shopName);
      };
    };

    // Google Maps APIがすでに読み込まれているかチェック
    if (window.google && window.google.maps) {
      initializeMap();
    } else {
      initMap();
    }

    // クリーンアップ
    return () => {
      markersRef.current = [];
      delete window.handleShopClick;
    };
  }, [menuData, onShopClick]);

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: '500px',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid #e5e7eb',
        }}
      />
    </div>
  );
}
