import {useEffect, useRef, useState} from 'react';

/**
 * Text for a polite status region that reports a result count after the user
 * filters a list. The text stays empty when the dialog opens, then follows the
 * count once it stops changing for `delay` ms, so typing does not announce
 * every keystroke.
 *
 * @returns {[string, Function]} the message, and a setter for an immediate
 *          message (for example after Select all).
 */
export const useCountAnnouncement = (count, isOpen, format, delay = 600) => {
    const [message, setMessage] = useState('');
    const isFirstCount = useRef(true);

    useEffect(() => {
        if (!isOpen) {
            setMessage('');
            isFirstCount.current = true;
            return undefined;
        }

        if (isFirstCount.current) {
            isFirstCount.current = false;
            return undefined;
        }

        const timer = setTimeout(() => setMessage(format(count)), delay);
        return () => clearTimeout(timer);
    }, [count, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    return [message, setMessage];
};
