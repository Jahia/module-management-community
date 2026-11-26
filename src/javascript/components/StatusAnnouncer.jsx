import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import * as PropTypes from 'prop-types';
import styles from './ModuleManagementCommunityApp.scss';

const AnnounceContext = createContext(() => {});

/**
 * The function that reads a message in the polite status region of the Modules screen, such as the result of a
 * start, a stop or an update. Outside the provider it does nothing.
 */
export const useAnnounce = () => useContext(AnnounceContext);

/** Holds one polite status region, present from the first render, and gives its children useAnnounce(). */
export const StatusAnnouncer = ({children}) => {
    const [message, setMessage] = useState('');
    const timer = useRef(null);

    const announce = useCallback(text => {
        // A screen reader reads a change only, so the region empties first and the same message can be read twice.
        setMessage('');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setMessage(text), 100);
    }, []);

    useEffect(() => () => clearTimeout(timer.current), []);

    return (
        <AnnounceContext.Provider value={announce}>
            {children}
            <div role="status" className={styles.srOnly} data-testid="operation-status">{message}</div>
        </AnnounceContext.Provider>
    );
};

StatusAnnouncer.propTypes = {
    children: PropTypes.node
};
