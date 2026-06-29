package org.jahia.support.modulemanagement.rest;

import org.apache.commons.fileupload.FileItemIterator;
import org.apache.commons.fileupload.FileItemStream;
import org.apache.commons.fileupload.FileUploadException;
import org.apache.commons.fileupload.servlet.ServletFileUpload;
import org.jahia.services.securityfilter.PermissionService;
import org.jahia.services.usermanager.JahiaUser;
import org.jahia.support.modulemanagement.ModuleManagementCommunityService;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.servlet.Servlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintWriter;

/**
 * HTTP servlet that handles JAR file uploads for module deployment
 * and YAML provisioning script uploads for direct execution.
 * Registered at /module-management-community/upload via OSGi HTTP Service.
 */
@Component(
        service = Servlet.class,
        property = {"alias=/module-management-community/upload"},
        immediate = true
)
public class ModuleUploadServlet extends AbstractModuleManagementServlet {

    private static final Logger logger = LoggerFactory.getLogger(ModuleUploadServlet.class);
    private static final long MAX_FILE_SIZE = 150 * 1024 * 1024L; // 150 MB
    private static final String ERROR_DEPLOY_FAILED = "{\"error\":\"Module deployment failed\"}";

    private final transient ModuleManagementCommunityService moduleManagementCommunityService;

    @Activate
    public ModuleUploadServlet(
            @Reference ModuleManagementCommunityService moduleManagementCommunityService,
            @Reference PermissionService permissionService) {
        super(permissionService);
        this.moduleManagementCommunityService = moduleManagementCommunityService;
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) {
        handleMultipartPost(request, response, "module-management-community.upload", logger, this::handleUpload);
    }

    private void handleUpload(HttpServletRequest request, HttpServletResponse response, PrintWriter writer, JahiaUser currentUser) {
        try {
            ServletFileUpload upload = new ServletFileUpload();
            upload.setFileSizeMax(MAX_FILE_SIZE);

            FileItemIterator iterator = upload.getItemIterator(request);
            while (iterator.hasNext()) {
                FileItemStream item = iterator.next();
                if (!item.isFormField() && "file".equals(item.getFieldName())) {
                    processFileItem(item, writer, currentUser);
                    return;
                }
            }

            response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            writer.write("{\"error\":\"No 'file' field found in the multipart request\"}");
        } catch (FileUploadException e) {
            logger.error("Error parsing multipart upload", e);
            response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            writer.write("{\"error\":\"Invalid multipart upload\"}");
        } catch (IOException e) {
            // Detail is logged server-side only; clients get a generic message (no internal leak).
            logger.error("Error processing uploaded module/provisioning file", e);
            response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
            writer.write(ERROR_DEPLOY_FAILED);
        }
    }

    private void processFileItem(FileItemStream item, PrintWriter writer, JahiaUser currentUser) throws IOException {
        String fileName = ServletSupport.sanitizeFileName(item.getName(), "upload.jar");
        String lowerName = fileName.toLowerCase();
        if (logger.isInfoEnabled()) {
            logger.info("Received upload request for file: {} by user: {}", fileName, ServletSupport.sanitizeForLog(currentUser.getName()));
        }

        try (InputStream stream = item.openStream()) {
            String result;
            if (lowerName.endsWith(".yaml") || lowerName.endsWith(".yml")) {
                result = moduleManagementCommunityService.applyProvisioningYaml(stream, fileName);
            } else {
                result = moduleManagementCommunityService.deployUploadedModule(stream, fileName);
            }
            writer.write("{\"message\":" + ServletSupport.toJsonString(result) + "}");
        }
    }

    @Override
    protected void doOptions(HttpServletRequest request, HttpServletResponse response) {
        handleOptions(request, response, "POST, OPTIONS");
    }
}
