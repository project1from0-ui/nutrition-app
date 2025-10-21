"use client";
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

export default function ShopMap({ menuData, onShopClick }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    // すでに地図が初期化されていたら何もしない
    if (mapRef.current) return;

    // 地図コンテナが存在しない場合は何もしない
    if (!mapContainerRef.current) return;

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
    const center = [35.7080, 139.7731]; // 上野広小路交差点

    // 地図を初期化
    const map = L.map(mapContainerRef.current, {
      center: center,
      zoom: 17,
      scrollWheelZoom: true,
    });

    mapRef.current = map;

    // タイルレイヤーを追加
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // 200m半径の円を追加
    L.circle(center, {
      radius: 200,
      color: '#667eea',
      fillColor: '#667eea',
      fillOpacity: 0.1,
      weight: 2,
    }).addTo(map);

    // 店舗ピンを追加
    shops.forEach((shop) => {
      const color = genreColors[shop.genre] || genreColors['未分類'];

      // カスタムアイコン
      const icon = L.divIcon({
        className: 'custom-pin',
        html: `<div style="
          background-color: ${color};
          width: 24px;
          height: 24px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 24],
        popupAnchor: [0, -24],
      });

      const marker = L.marker([shop.latitude, shop.longitude], { icon }).addTo(map);

      // ポップアップ
      const popupContent = `
        <div style="padding: 4px;">
          <h3 style="font-size: 14px; font-weight: bold; margin-bottom: 4px;">${shop.shop}</h3>
          <p style="font-size: 12px; color: #666; margin-bottom: 4px;">【${shop.genre}】</p>
          <p style="font-size: 12px; color: #666; margin-bottom: 8px;">${shop.menuCount}メニュー</p>
          <button
            onclick="window.handleShopClick('${shop.shop.replace(/'/g, "\\'")}')"
            style="
              width: 100%;
              padding: 6px 12px;
              background: #667eea;
              color: white;
              border: none;
              border-radius: 6px;
              font-size: 12px;
              font-weight: bold;
              cursor: pointer;
            "
          >
            メニューを見る
          </button>
        </div>
      `;

      marker.bindPopup(popupContent);
    });

    // グローバル関数を設定（ポップアップのボタンから呼ばれる）
    window.handleShopClick = (shopName) => {
      onShopClick(shopName);
    };

    // クリーンアップ
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
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
          position: 'relative',
          zIndex: 0,
        }}
      />

      {/* 凡例 */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        right: 20,
        background: 'white',
        padding: 12,
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        zIndex: 1000,
        maxHeight: '200px',
        overflowY: 'auto',
      }}>
        <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 8 }}>ジャンル</div>
        {Object.entries(genreColors).map(([genre, color]) => (
          <div key={genre} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: color,
              border: '1px solid white',
            }}></div>
            <span style={{ fontSize: 11 }}>{genre}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
