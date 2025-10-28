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

export default function GoogleMap({ menuData, onShopClick, highlightedShop, onShopHover, isLoading = false }) {
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

      // 緯度経度の有無をチェック
      const withLocation = menuData.filter(item => item.latitude && item.longitude);
      const withoutLocation = menuData.filter(item => !item.latitude || !item.longitude);
      console.log(`[GoogleMap] 緯度経度あり: ${withLocation.length}件, 緯度経度なし: ${withoutLocation.length}件`);
      if (withoutLocation.length > 0) {
        console.log('[GoogleMap] 緯度経度なしサンプル:', withoutLocation.slice(0, 3).map(item => ({
          shop: item.shop,
          menu: item.menu,
          latitude: item.latitude,
          longitude: item.longitude
        })));
      }

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

      console.log('[GoogleMap] 地図に表示する店舗数:', shops.length);
      console.log('[GoogleMap] サンプル店舗:', shops.slice(0, 3));

      // カスタムマップスタイル
      const mapStyles = [
        {
          "featureType": "all",
          "elementType": "geometry",
          "stylers": [{ "color": "#f5f5f5" }]
        },
        {
          "featureType": "water",
          "elementType": "geometry",
          "stylers": [{ "color": "#c9e7f2" }]
        },
        {
          "featureType": "road",
          "elementType": "geometry",
          "stylers": [{ "color": "#ffffff" }]
        },
        {
          "featureType": "road",
          "elementType": "geometry.stroke",
          "stylers": [{ "color": "#e0e0e0" }]
        },
        {
          "featureType": "poi",
          "elementType": "labels",
          "stylers": [{ "visibility": "off" }]
        },
        {
          "featureType": "transit",
          "stylers": [{ "visibility": "off" }]
        },
        {
          "featureType": "administrative",
          "elementType": "labels.text.fill",
          "stylers": [{ "color": "#9ca3af" }]
        },
        {
          "featureType": "road",
          "elementType": "labels.text.fill",
          "stylers": [{ "color": "#6b7280" }]
        },
        {
          "featureType": "poi.park",
          "elementType": "geometry",
          "stylers": [{ "color": "#d4f1d4" }]
        }
      ];

      // 地図を初期化
      const map = new window.google.maps.Map(mapContainerRef.current, {
        center: center,
        zoom: 17,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        zoomControlOptions: {
          position: window.google.maps.ControlPosition.RIGHT_CENTER
        },
        styles: mapStyles,
        disableDefaultUI: false,
        clickableIcons: false,
      });

      mapRef.current = map;

      // 現在地マーカーを追加（グラデーション風の複数レイヤー）
      // 外側の薄い円
      new window.google.maps.Marker({
        position: center,
        map: map,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: '#667eea',
          fillOpacity: 0.15,
          strokeColor: 'transparent',
          strokeWeight: 0,
          scale: 20,
        },
        zIndex: 998,
      });

      // 中間の円
      new window.google.maps.Marker({
        position: center,
        map: map,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: '#667eea',
          fillOpacity: 0.4,
          strokeColor: 'transparent',
          strokeWeight: 0,
          scale: 12,
        },
        zIndex: 999,
      });

      // 内側のメイン円
      new window.google.maps.Marker({
        position: center,
        map: map,
        title: '現在地',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: '#667eea',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
          scale: 8,
        },
        zIndex: 1000,
      });

      // 中心の白い点
      new window.google.maps.Marker({
        position: center,
        map: map,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: '#ffffff',
          fillOpacity: 1,
          strokeColor: 'transparent',
          strokeWeight: 0,
          scale: 3,
        },
        zIndex: 1001,
      });

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

        // カスタムマーカー（📍アイコン）
        const marker = new window.google.maps.Marker({
          position: { lat: shop.latitude, lng: shop.longitude },
          map: map,
          title: shop.shop,
          label: {
            text: '📍',
            fontSize: '32px',
          },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 0,
            fillOpacity: 0,
            strokeOpacity: 0,
          },
          zIndex: 1,
        });

        // この店舗のメニューリストを取得
        const shopMenus = menuData.filter(item => item.shop === shop.shop);

        // メニューリストのHTMLを生成
        const menuListHTML = shopMenus.slice(0, 5).map((menu, idx) => `
          <div style="
            padding: 10px 12px;
            margin-bottom: 6px;
            background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
            border-radius: 8px;
            cursor: pointer;
            border: 1px solid #e9ecef;
            transition: all 0.2s ease;
            box-shadow: 0 1px 2px rgba(0,0,0,0.04);
          " onclick="window.handleMenuClick('${menu.shop.replace(/'/g, "\\'")}', '${menu.menu.replace(/'/g, "\\'")}')">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span style="
                display: inline-block;
                width: 20px;
                height: 20px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                font-size: 10px;
                font-weight: 700;
                border-radius: 50%;
                text-align: center;
                line-height: 20px;
              ">${idx + 1}</span>
              <div style="font-size: 13px; font-weight: 600; color: #1f2937; flex: 1;">${menu.menu}</div>
            </div>
            <div style="display: flex; gap: 12px; padding-left: 28px; font-size: 11px; color: #6b7280;">
              <span style="display: flex; align-items: center; gap: 4px;">
                <span style="font-weight: 600; color: #667eea;">${menu.calories || '-'}</span> kcal
              </span>
              <span style="display: flex; align-items: center; gap: 4px;">
                P: <span style="font-weight: 600; color: #667eea;">${menu.protein || '-'}</span>g
              </span>
            </div>
          </div>
        `).join('');

        const moreCount = shopMenus.length > 5 ? `
          <div style="
            font-size: 11px;
            color: #9ca3af;
            text-align: center;
            margin-top: 8px;
            padding: 6px;
            background: #f9fafb;
            border-radius: 6px;
          ">
            他${shopMenus.length - 5}件のメニュー
          </div>
        ` : '';

        // 情報ウィンドウ
        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div style="
              padding: 16px;
              min-width: 260px;
              max-width: 300px;
              max-height: 450px;
              overflow-y: auto;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            ">
              <div style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 12px;
                padding-bottom: 12px;
                border-bottom: 2px solid #f3f4f6;
              ">
                <div>
                  <h3 style="font-size: 16px; font-weight: 700; margin: 0 0 4px 0; color: #111827;">${shop.shop}</h3>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="
                      font-size: 11px;
                      color: #667eea;
                      font-weight: 600;
                      background: linear-gradient(135deg, #eff6ff, #f3f4f6);
                      padding: 3px 8px;
                      border-radius: 12px;
                      border: 1px solid #e0e7ff;
                    ">${shop.genre}</span>
                    <span style="font-size: 11px; color: #9ca3af; font-weight: 500;">${shop.menuCount}メニュー</span>
                  </div>
                </div>
              </div>
              <div style="margin-bottom: 12px;">
                ${menuListHTML}
                ${moreCount}
              </div>
              <button
                onclick="window.handleShopClick('${shop.shop.replace(/'/g, "\\'")}')"
                style="
                  width: 100%;
                  padding: 12px 16px;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                  border: none;
                  border-radius: 8px;
                  font-size: 13px;
                  font-weight: 700;
                  cursor: pointer;
                  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
                  transition: all 0.2s ease;
                "
                onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.4)'"
                onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(102, 126, 234, 0.3)'"
              >
                全メニューを見る →
              </button>
            </div>
          `,
        });

        marker.addListener('click', () => {
          // 他の情報ウィンドウを閉じる
          markersRef.current.forEach(m => m.infoWindow.close());
          infoWindow.open(map, marker);
        });

        // マーカーのhoverイベント
        marker.addListener('mouseover', () => {
          if (onShopHover) {
            onShopHover(shop.shop);
          }
        });

        marker.addListener('mouseout', () => {
          if (onShopHover) {
            onShopHover(null);
          }
        });

        markersRef.current.push({ marker, infoWindow, shopName: shop.shop });
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

  // ローディング時の点滅アニメーション（各ピンがバラバラに点滅）
  useEffect(() => {
    if (!isLoading) return;

    const intervals = [];

    markersRef.current.forEach(({ marker }, index) => {
      let blinkState = true;
      // 各マーカーにランダムな初期遅延を追加
      const randomDelay = Math.random() * 300;

      setTimeout(() => {
        const interval = setInterval(() => {
          marker.setLabel({
            text: '📍',
            fontSize: blinkState ? '32px' : '24px',
          });
          blinkState = !blinkState;
        }, 200 + Math.random() * 100); // 200-300msのランダムな間隔

        intervals.push(interval);
      }, randomDelay);
    });

    return () => {
      intervals.forEach(interval => clearInterval(interval));
    };
  }, [isLoading]);

  // highlightedShopが変更されたときにマーカーを強調表示
  useEffect(() => {
    if (!highlightedShop) {
      // ハイライトをリセット（全て表示）
      markersRef.current.forEach(({ marker }) => {
        marker.setVisible(true);
        marker.setLabel({
          text: '📍',
          fontSize: '32px',
        });
        marker.setZIndex(1);
      });
      return;
    }

    // 該当する店舗のマーカーのみ表示、それ以外は非表示
    markersRef.current.forEach(({ marker, shopName }) => {
      if (shopName === highlightedShop) {
        marker.setVisible(true);
        marker.setLabel({
          text: '📍',
          fontSize: '48px', // 大きくする
        });
        marker.setZIndex(1000); // 最前面に
      } else {
        marker.setVisible(false); // 非表示にする
      }
    });
  }, [highlightedShop]);

  return (
    <div style={{ position: 'relative' }}>
      {/* Map Container */}
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: '500px',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        }}
      />
    </div>
  );
}
