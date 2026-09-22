package org.jahia.support.modulemanagement.store;

import java.io.IOException;

/**
 * Raised when a store module index URL is refused by {@link StoreIndexUrlValidator}.
 *
 * <p>Extends {@link IOException} on purpose: callers that already treat a failed store index fetch
 * as "log and fall back to the bundled catalogue" keep working unchanged, while callers that want
 * to tell a policy refusal apart from a network failure can catch this type specifically.</p>
 */
public class StoreIndexUrlRejectedException extends IOException {

    private static final long serialVersionUID = 1L;

    private final boolean policyViolation;

    /**
     * A refusal by the egress policy itself — a disallowed scheme, embedded credentials, or an
     * internal host. Worth an {@code ERROR}: something configured this URL that should not have.
     */
    public StoreIndexUrlRejectedException(String message) {
        this(message, true);
    }

    private StoreIndexUrlRejectedException(String message, boolean policyViolation) {
        super(message);
        this.policyViolation = policyViolation;
    }

    /**
     * A refusal because the host could not be resolved, so the policy could not be applied to it.
     * That is an ordinary network condition on an air-gapped or offline node, not a policy breach,
     * and callers should log it as such rather than flooding the log with errors on every refresh.
     *
     * <p>It is still a refusal: accepting a name that fails to resolve now but resolves at connect
     * time would hand an attacker a free DNS-rebinding primitive.</p>
     */
    public static StoreIndexUrlRejectedException unresolvable(String message) {
        return new StoreIndexUrlRejectedException(message, false);
    }

    /**
     * @return {@code true} when the URL breached the egress policy, {@code false} when it merely
     * could not be vetted.
     */
    public boolean isPolicyViolation() {
        return policyViolation;
    }
}
