import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// Android edge-to-edge delivers IME insets to the app; windowSoftInputMode
// (pan/resize) is ignored for positioning, so the app must pad for the keyboard
// itself. We update only when the reported height settles by >= SETTLE_DELTA,
// otherwise the IME animation feed-back loops (keyboard inset churn).
const SETTLE_DELTA = 6;

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    function apply(height: number) {
      setInset((current) => (Math.abs(height - current) >= SETTLE_DELTA ? height : current));
    }

    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      apply(event.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      apply(0);
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return inset;
}